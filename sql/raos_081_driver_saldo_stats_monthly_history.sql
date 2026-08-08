-- raos_081_driver_saldo_stats_monthly_history
--
-- Scope:
-- 1) DB Driver: simpan statistik saldo all-time per driver.
-- 2) Simpan statistik saldo per driver per bulan.
-- 3) Siapkan arsip riwayat bulanan lintas modul secara copy-only/idempotent.
--
-- Catatan operasional:
-- - Statistik hanya menghitung raos_saldo_requests.is_processed = true.
-- - Data sumber TIDAK dihapus oleh migration/function ini.
-- - archive_monthly_history() hanya menyalin snapshot JSONB dari source table
--   yang terdaftar di monthly_history_sources.

-- ============================================================
-- A. DRIVER SALDO STATS — ALL TIME
-- ============================================================

ALTER TABLE public.raos_drivers
  ADD COLUMN IF NOT EXISTS saldo_total_nominal numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_frequency integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_last_processed_at timestamptz;

COMMENT ON COLUMN public.raos_drivers.saldo_total_nominal IS
  'Total nominal pengisian saldo yang sudah diproses/Lunas untuk driver ini (all-time).';
COMMENT ON COLUMN public.raos_drivers.saldo_frequency IS
  'Frekuensi/jumlah pengisian saldo yang sudah diproses/Lunas untuk driver ini (all-time).';
COMMENT ON COLUMN public.raos_drivers.saldo_last_processed_at IS
  'Waktu pengisian saldo terakhir yang sudah diproses/Lunas untuk driver ini.';

-- ============================================================
-- B. DRIVER SALDO STATS — PER BULAN
-- ============================================================

CREATE TABLE IF NOT EXISTS public.raos_driver_saldo_monthly (
  driver_id uuid NOT NULL REFERENCES public.raos_drivers(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  total_nominal numeric(18,2) NOT NULL DEFAULT 0,
  frequency integer NOT NULL DEFAULT 0,
  last_processed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (driver_id, period_month),
  CONSTRAINT raos_driver_saldo_monthly_month_check
    CHECK (period_month = date_trunc('month', period_month)::date)
);

CREATE INDEX IF NOT EXISTS raos_driver_saldo_monthly_period_idx
  ON public.raos_driver_saldo_monthly(period_month DESC);

ALTER TABLE public.raos_driver_saldo_monthly ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS raos_driver_saldo_monthly_read_scoped
  ON public.raos_driver_saldo_monthly;
CREATE POLICY raos_driver_saldo_monthly_read_scoped
  ON public.raos_driver_saldo_monthly
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.is_active = true
        AND (
          up.role IN ('admin','direksi','management','koordinator','driver_manager')
          OR (up.role = 'driver' AND up.driver_id = raos_driver_saldo_monthly.driver_id)
        )
    )
  );

-- Recalculate one driver's all-time + monthly statistics from source-of-truth.
CREATE OR REPLACE FUNCTION public.raos_refresh_driver_saldo_stats(p_driver_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_driver_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.raos_drivers d
  SET saldo_total_nominal = s.total_nominal,
      saldo_frequency = s.frequency,
      saldo_last_processed_at = s.last_processed_at,
      updated_at = now()
  FROM (
    SELECT
      coalesce(sum(r.nominal), 0)::numeric(18,2) AS total_nominal,
      count(*)::integer AS frequency,
      max(r.processed_at) AS last_processed_at
    FROM public.raos_saldo_requests r
    WHERE r.driver_id = p_driver_id
      AND r.is_processed = true
  ) s
  WHERE d.id = p_driver_id;

  DELETE FROM public.raos_driver_saldo_monthly m
  WHERE m.driver_id = p_driver_id;

  INSERT INTO public.raos_driver_saldo_monthly (
    driver_id, period_month, total_nominal, frequency, last_processed_at, updated_at
  )
  SELECT
    r.driver_id,
    date_trunc('month', coalesce(r.processed_at, r.updated_at, r.created_at))::date,
    sum(r.nominal)::numeric(18,2),
    count(*)::integer,
    max(r.processed_at),
    now()
  FROM public.raos_saldo_requests r
  WHERE r.driver_id = p_driver_id
    AND r.is_processed = true
  GROUP BY r.driver_id, date_trunc('month', coalesce(r.processed_at, r.updated_at, r.created_at))::date;
END;
$$;

REVOKE ALL ON FUNCTION public.raos_refresh_driver_saldo_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.raos_refresh_driver_saldo_stats(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.raos_sync_driver_saldo_stats_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.raos_refresh_driver_saldo_stats(OLD.driver_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.driver_id IS DISTINCT FROM NEW.driver_id THEN
    PERFORM public.raos_refresh_driver_saldo_stats(OLD.driver_id);
  END IF;

  PERFORM public.raos_refresh_driver_saldo_stats(NEW.driver_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_raos_sync_driver_saldo_stats
  ON public.raos_saldo_requests;
CREATE TRIGGER trg_raos_sync_driver_saldo_stats
AFTER INSERT OR UPDATE OF driver_id, nominal, is_processed, processed_at OR DELETE
ON public.raos_saldo_requests
FOR EACH ROW
EXECUTE FUNCTION public.raos_sync_driver_saldo_stats_trigger();

-- Initial backfill for existing processed saldo.
DO $$
DECLARE
  v_driver_id uuid;
BEGIN
  FOR v_driver_id IN
    SELECT DISTINCT driver_id
    FROM public.raos_saldo_requests
    WHERE driver_id IS NOT NULL
  LOOP
    PERFORM public.raos_refresh_driver_saldo_stats(v_driver_id);
  END LOOP;
END;
$$;

-- ============================================================
-- C. MONTHLY HISTORY ARCHIVE — GENERIC, COPY ONLY
-- ============================================================

CREATE TABLE IF NOT EXISTS public.monthly_history_sources (
  source_table text PRIMARY KEY,
  module_name text NOT NULL,
  id_column text NOT NULL DEFAULT 'id',
  time_column text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.monthly_history_archive (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  module_name text NOT NULL,
  source_table text NOT NULL,
  source_record_id text NOT NULL,
  period_month date NOT NULL,
  occurred_at timestamptz,
  payload jsonb NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT monthly_history_archive_month_check
    CHECK (period_month = date_trunc('month', period_month)::date),
  CONSTRAINT monthly_history_archive_unique
    UNIQUE (source_table, source_record_id, period_month)
);

CREATE INDEX IF NOT EXISTS monthly_history_archive_period_module_idx
  ON public.monthly_history_archive(period_month DESC, module_name);
CREATE INDEX IF NOT EXISTS monthly_history_archive_source_idx
  ON public.monthly_history_archive(source_table, source_record_id);
CREATE INDEX IF NOT EXISTS monthly_history_archive_payload_gin_idx
  ON public.monthly_history_archive USING gin(payload);

ALTER TABLE public.monthly_history_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_history_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS monthly_history_sources_admin_read ON public.monthly_history_sources;
CREATE POLICY monthly_history_sources_admin_read
  ON public.monthly_history_sources
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.is_active = true
        AND up.role IN ('admin','direksi','management')
    )
  );

DROP POLICY IF EXISTS monthly_history_archive_admin_read ON public.monthly_history_archive;
CREATE POLICY monthly_history_archive_admin_read
  ON public.monthly_history_archive
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.is_active = true
        AND up.role IN ('admin','direksi','management')
    )
  );

-- Registry awal untuk tabel riwayat aktif lintas modul.
-- Hanya tabel transaksi/audit/history; master/config tidak diarsip otomatis.
INSERT INTO public.monthly_history_sources(source_table, module_name, id_column, time_column)
VALUES
  ('raos_saldo_requests', 'RAOS_FINANCE', 'id', 'requested_at'),
  ('raos_attendance', 'RAOS_ATTENDANCE', 'id', 'date'),
  ('scan_orders', 'RAOS_SCAN', 'id', 'scanned_at'),
  ('raos_driver_queue', 'RAOS_QUEUE', 'id', 'joined_at'),
  ('chat_messages', 'RAOS_CHAT', 'id', 'created_at'),
  ('notifications', 'NOTIFICATION', 'id', 'created_at'),
  ('notification_delivery_log', 'NOTIFICATION', 'id', 'attempted_at'),
  ('activity_logs', 'AUDIT', 'id', 'created_at'),
  ('system_logs', 'AUDIT', 'id', 'created_at'),
  ('saldo_events', 'FINANCE', 'id', 'created_at'),
  ('crm_audit_log', 'CRM', 'id', 'created_at'),
  ('doc_documents', 'SMART_OFFICE', 'id', 'created_at'),
  ('doc_revisions', 'SMART_OFFICE', 'id', 'created_at'),
  ('doc_approvals', 'SMART_OFFICE', 'id', 'created_at'),
  ('doc_audit_log', 'SMART_OFFICE', 'id', 'created_at'),
  ('attendance', 'HRIS', 'id', 'attendance_date'),
  ('leave_requests', 'HRIS', 'id', 'created_at'),
  ('employee_contracts', 'HRIS', 'id', 'created_at'),
  ('payroll', 'PAYROLL', 'id', 'created_at'),
  ('raos_payroll', 'RAOS_PAYROLL', 'staff_id', 'effective_month')
ON CONFLICT (source_table) DO UPDATE
SET module_name = EXCLUDED.module_name,
    id_column = EXCLUDED.id_column,
    time_column = EXCLUDED.time_column,
    enabled = true,
    updated_at = now();

-- Copy snapshots for one calendar month. Safe to rerun.
CREATE OR REPLACE FUNCTION public.archive_monthly_history(p_month date)
RETURNS TABLE(source_table text, archived_rows bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v record;
  v_month_start date := date_trunc('month', p_month)::date;
  v_month_end date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_sql text;
  v_count bigint;
  v_table_exists boolean;
  v_id_exists boolean;
  v_time_exists boolean;
BEGIN
  IF p_month IS NULL THEN
    RAISE EXCEPTION 'p_month wajib diisi';
  END IF;

  FOR v IN
    SELECT * FROM public.monthly_history_sources WHERE enabled = true ORDER BY module_name, source_table
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = v.source_table
    ) INTO v_table_exists;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = v.source_table AND column_name = v.id_column
    ) INTO v_id_exists;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = v.source_table AND column_name = v.time_column
    ) INTO v_time_exists;

    IF NOT (v_table_exists AND v_id_exists AND v_time_exists) THEN
      CONTINUE;
    END IF;

    v_sql := format(
      'INSERT INTO public.monthly_history_archive '
      || '(module_name, source_table, source_record_id, period_month, occurred_at, payload) '
      || 'SELECT %L, %L, t.%I::text, %L::date, t.%I::timestamptz, to_jsonb(t) '
      || 'FROM public.%I t '
      || 'WHERE t.%I >= %L::date AND t.%I < %L::date '
      || 'ON CONFLICT (source_table, source_record_id, period_month) DO UPDATE '
      || 'SET occurred_at = EXCLUDED.occurred_at, payload = EXCLUDED.payload, archived_at = now()',
      v.module_name,
      v.source_table,
      v.id_column,
      v_month_start,
      v.time_column,
      v.source_table,
      v.time_column,
      v_month_start,
      v.time_column,
      v_month_end
    );

    EXECUTE v_sql;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    source_table := v.source_table;
    archived_rows := v_count;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_monthly_history(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_monthly_history(date) TO service_role;

COMMENT ON FUNCTION public.archive_monthly_history(date) IS
  'Copy-only idempotent monthly archive. Does not delete source rows. Run after month close, e.g. archive_monthly_history(''2026-08-01'').';
