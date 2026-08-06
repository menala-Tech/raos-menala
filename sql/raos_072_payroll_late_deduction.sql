
-- ============================================================================
-- HRIS Absensi Overhaul Phase 4 — wire late_deduction ke raos_payroll
-- ============================================================================

ALTER TABLE public.raos_payroll
  ADD COLUMN IF NOT EXISTS late_deduction_total integer DEFAULT 0;

-- Drop + recreate thp (generated) supaya include minus late_deduction_total
ALTER TABLE public.raos_payroll DROP COLUMN IF EXISTS thp;
ALTER TABLE public.raos_payroll
  ADD COLUMN thp integer GENERATED ALWAYS AS (
    gapok + bonus_saldo + bpjs + paket_data + member_parkir + bonus_kpi - COALESCE(late_deduction_total, 0)
  ) STORED;

COMMENT ON COLUMN public.raos_payroll.late_deduction_total IS
  'Total potongan terlambat bulan ini (SUM raos_attendance.late_deduction_idr). Auto-set oleh raos_compute_payroll_month.';

-- Update RPC — inject compute late_deduction_total per staff per bulan
CREATE OR REPLACE FUNCTION public.raos_compute_payroll_month(p_month date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_processed int := 0;
  v_month_start date := date_trunc('month', p_month)::date;
  v_month_end   date := (v_month_start + INTERVAL '1 month - 1 day')::date;
  v_min_active_days int := 25;
  r record;
  v_cabang_pct numeric;
  v_staff_pct numeric;
  v_driver_active_ratio numeric;
  v_bonus_saldo_max int;
  v_bonus_saldo int;
  v_bonus_kpi int;
  v_gapok int;
  v_target_staff bigint;
  v_realisasi bigint;
  v_status text;
  v_cabang_slug text;
  v_is_excluded_cabang boolean;
  v_target_cabang_row record;
  v_staff_capai_count int;
  v_staff_total_count int;
  v_member_parkir int;
  v_late_ded int;
BEGIN
  v_role := public.get_my_role();
  IF NOT (v_role = ANY (ARRAY['admin','management','direksi'])) AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Only admin/management/direksi can compute payroll';
  END IF;

  FOR r IN
    SELECT up.id AS staff_id, up.role, up.branch_id, up.gaji, b.slug AS branch_slug, b.name AS branch_name
    FROM public.user_profiles up
    JOIN public.branches b ON b.id = up.branch_id
    WHERE up.is_active = true
      AND up.role = ANY (ARRAY['staff','koordinator'])
      AND up.branch_id IS NOT NULL
  LOOP
    v_gapok := COALESCE(r.gaji, 0)::int;
    v_cabang_slug := COALESCE(r.branch_slug, '');
    v_is_excluded_cabang := (v_cabang_slug ILIKE '%soeta%' OR v_cabang_slug ILIKE '%makassar%');

    -- NEW Phase 4: SUM potongan terlambat bulan ini
    SELECT COALESCE(SUM(late_deduction_idr), 0)::int INTO v_late_ded
    FROM public.raos_attendance
    WHERE staff_id = r.staff_id
      AND date >= v_month_start
      AND date <= v_month_end;

    SELECT * INTO v_target_cabang_row
    FROM public.raos_kpi_targets_branch
    WHERE branch_id = r.branch_id AND effective_month = v_month_start;

    SELECT target_saldo, member_parkir_amount INTO v_target_staff, v_member_parkir
    FROM public.raos_kpi_targets_staff
    WHERE staff_id = r.staff_id AND effective_month = v_month_start;

    IF v_target_staff IS NULL THEN
      v_target_staff := COALESCE(v_target_cabang_row.target_staff_default, 0);
    END IF;
    IF v_member_parkir IS NULL THEN v_member_parkir := 0; END IF;

    SELECT COALESCE(realisasi_saldo, 0) INTO v_realisasi
    FROM public.raos_target_tercapai_bulan
    WHERE staff_id = r.staff_id AND effective_month = v_month_start;

    IF v_realisasi IS NULL THEN v_realisasi := 0; END IF;

    IF v_target_staff > 0 THEN
      v_staff_pct := (v_realisasi::numeric / v_target_staff::numeric) * 100;
    ELSE
      v_staff_pct := 0;
    END IF;

    SELECT
      COUNT(*) FILTER (WHERE realisasi >= tgt AND tgt > 0),
      COUNT(*)
    INTO v_staff_capai_count, v_staff_total_count
    FROM (
      SELECT
        up2.id,
        COALESCE(
          (SELECT target_saldo FROM public.raos_kpi_targets_staff
           WHERE staff_id = up2.id AND effective_month = v_month_start),
          v_target_cabang_row.target_staff_default,
          0
        ) AS tgt,
        COALESCE(
          (SELECT realisasi_saldo FROM public.raos_target_tercapai_bulan
           WHERE staff_id = up2.id AND effective_month = v_month_start),
          0
        ) AS realisasi
      FROM public.user_profiles up2
      WHERE up2.branch_id = r.branch_id
        AND up2.is_active = true
        AND up2.role = ANY (ARRAY['staff','koordinator'])
    ) sub;

    IF v_staff_total_count > 0 THEN
      v_cabang_pct := (v_staff_capai_count::numeric / v_staff_total_count::numeric) * 100;
    ELSE
      v_cabang_pct := 0;
    END IF;

    v_bonus_saldo_max := CASE WHEN r.role = 'koordinator' THEN 2000000 ELSE 1500000 END;
    IF v_is_excluded_cabang THEN
      v_bonus_saldo := 0;
    ELSIF v_cabang_pct >= 100 AND v_staff_pct >= 100 THEN
      v_bonus_saldo := v_bonus_saldo_max;
    ELSIF v_cabang_pct >= 90 AND v_staff_pct >= 90 THEN
      v_bonus_saldo := (v_bonus_saldo_max * 0.8)::int;
    ELSIF v_cabang_pct >= 80 AND v_staff_pct >= 80 THEN
      v_bonus_saldo := (v_bonus_saldo_max * 0.6)::int;
    ELSE
      v_bonus_saldo := 0;
    END IF;

    SELECT
      CASE WHEN COUNT(*) > 0
        THEN COUNT(*) FILTER (WHERE COALESCE(active_days, 0) >= v_min_active_days)::numeric / COUNT(*)::numeric * 100
        ELSE 0 END
    INTO v_driver_active_ratio
    FROM public.raos_driver_active_days_bulan
    WHERE staff_id = r.staff_id AND effective_month = v_month_start;

    IF v_driver_active_ratio IS NULL THEN v_driver_active_ratio := 0; END IF;

    IF v_driver_active_ratio >= 100 THEN
      v_bonus_kpi := 300000;
    ELSIF v_driver_active_ratio >= 90 THEN
      v_bonus_kpi := 240000;
    ELSIF v_driver_active_ratio >= 80 THEN
      v_bonus_kpi := 180000;
    ELSE
      v_bonus_kpi := 0;
    END IF;

    IF v_is_excluded_cabang THEN
      v_status := 'na';
    ELSIF v_staff_pct >= 100 THEN
      v_status := 'ok';
    ELSIF v_staff_pct >= 80 THEN
      v_status := 'warning';
    ELSE
      v_status := 'cut_off';
    END IF;

    INSERT INTO public.raos_payroll (
      staff_id, effective_month, gapok, bonus_saldo, bpjs, paket_data,
      member_parkir, bonus_kpi, late_deduction_total,
      target_pct, driver_active_pct, status_target,
      computed_at, computed_by
    )
    VALUES (
      r.staff_id, v_month_start, v_gapok, v_bonus_saldo, 55000, 100000,
      v_member_parkir, v_bonus_kpi, v_late_ded,
      COALESCE(v_staff_pct, 0), COALESCE(v_driver_active_ratio, 0),
      v_status, now(), auth.uid()
    )
    ON CONFLICT (staff_id, effective_month) DO UPDATE SET
      gapok = EXCLUDED.gapok,
      bonus_saldo = EXCLUDED.bonus_saldo,
      bpjs = EXCLUDED.bpjs,
      paket_data = EXCLUDED.paket_data,
      member_parkir = EXCLUDED.member_parkir,
      bonus_kpi = EXCLUDED.bonus_kpi,
      late_deduction_total = EXCLUDED.late_deduction_total,
      target_pct = EXCLUDED.target_pct,
      driver_active_pct = EXCLUDED.driver_active_pct,
      status_target = EXCLUDED.status_target,
      computed_at = now(),
      computed_by = auth.uid();

    v_processed := v_processed + 1;
  END LOOP;

  RETURN v_processed;
END $function$;
