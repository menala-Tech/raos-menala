
-- ============================================================================
-- HRIS Absensi Overhaul Phase 1 — extend raos_attendance
-- Task: Terlambat + Potongan (10rb/30min), manual edit audit, backup
-- ============================================================================

-- ---------- 1. Extend raos_attendance ------------------------------------
ALTER TABLE public.raos_attendance
  ADD COLUMN IF NOT EXISTS late_minutes int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_deduction_idr numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_edited_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manual_edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS edit_reason text,
  ADD COLUMN IF NOT EXISTS check_in_at_override timestamptz,
  ADD COLUMN IF NOT EXISTS check_out_at_override timestamptz;

COMMENT ON COLUMN public.raos_attendance.late_minutes IS 'Menit terlambat vs shift start_time (compute on write via trigger)';
COMMENT ON COLUMN public.raos_attendance.late_deduction_idr IS 'Potongan gaji terlambat: CEIL(late_minutes/30) * LATE_DEDUCTION_RATE (config)';
COMMENT ON COLUMN public.raos_attendance.check_in_at_override IS 'Manual override jam masuk oleh admin HRIS (null = pakai check_in_at asli)';
COMMENT ON COLUMN public.raos_attendance.check_out_at_override IS 'Manual override jam pulang (null = pakai check_out_at asli)';

-- ---------- 2. System config ---------------------------------------------
INSERT INTO public.system_config (key, value, description)
VALUES
  ('LATE_DEDUCTION_RATE_IDR', '10000', 'Nominal Rp potongan per unit interval terlambat'),
  ('LATE_DEDUCTION_INTERVAL_MIN', '30', 'Interval menit setiap unit potongan terlambat'),
  ('MONTHLY_LIBUR_DAYS', '4', 'Hari libur per bulan untuk kalkulasi gapok proporsional')
ON CONFLICT (key) DO NOTHING;

-- ---------- 3. Trigger auto-compute late_minutes + late_deduction --------
CREATE OR REPLACE FUNCTION public.raos_attendance_compute_late()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift_start time;
  v_rate        numeric := 10000;
  v_interval    int := 30;
  v_check_in    timestamptz;
BEGIN
  -- pakai override kalau ada, else pakai check_in_at asli
  v_check_in := COALESCE(NEW.check_in_at_override, NEW.check_in_at);
  IF v_check_in IS NULL OR NEW.shift_id IS NULL THEN
    NEW.late_minutes := 0;
    NEW.late_deduction_idr := 0;
    RETURN NEW;
  END IF;

  SELECT start_time INTO v_shift_start FROM public.shifts WHERE id = NEW.shift_id;
  IF v_shift_start IS NULL THEN
    NEW.late_minutes := 0;
    NEW.late_deduction_idr := 0;
    RETURN NEW;
  END IF;

  -- Load config (fallback default kalau row tidak ada)
  SELECT COALESCE((SELECT value::numeric FROM public.system_config WHERE key='LATE_DEDUCTION_RATE_IDR'), 10000)
    INTO v_rate;
  SELECT COALESCE((SELECT value::int FROM public.system_config WHERE key='LATE_DEDUCTION_INTERVAL_MIN'), 30)
    INTO v_interval;

  -- Compute selisih menit (positive = terlambat, negative/0 = tepat waktu/awal)
  NEW.late_minutes := GREATEST(0, EXTRACT(EPOCH FROM (
    v_check_in::time - v_shift_start
  ))::int / 60);

  NEW.late_deduction_idr := CEIL(NEW.late_minutes::numeric / v_interval) * v_rate;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_raos_attendance_compute_late ON public.raos_attendance;
CREATE TRIGGER trg_raos_attendance_compute_late
BEFORE INSERT OR UPDATE OF check_in_at, check_in_at_override, shift_id ON public.raos_attendance
FOR EACH ROW EXECUTE FUNCTION public.raos_attendance_compute_late();

-- ---------- 4. RPC hris_attendance_edit (admin/direksi only) -------------
CREATE OR REPLACE FUNCTION public.hris_attendance_edit(
  p_attendance_id       uuid,
  p_check_in_override   timestamptz DEFAULT NULL,
  p_check_out_override  timestamptz DEFAULT NULL,
  p_late_deduction_idr  numeric DEFAULT NULL,
  p_reason              text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT role INTO v_role FROM public.user_profiles WHERE id = v_user;
  IF v_role NOT IN ('admin','management','direksi') THEN
    RAISE EXCEPTION 'forbidden: role % tidak boleh edit absensi', v_role;
  END IF;

  UPDATE public.raos_attendance
     SET check_in_at_override  = COALESCE(p_check_in_override,  check_in_at_override),
         check_out_at_override = COALESCE(p_check_out_override, check_out_at_override),
         late_deduction_idr    = COALESCE(p_late_deduction_idr, late_deduction_idr),
         edit_reason           = COALESCE(p_reason, edit_reason),
         manual_edited_by      = v_user,
         manual_edited_at      = now()
   WHERE id = p_attendance_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'attendance % tidak ditemukan', p_attendance_id; END IF;

  RETURN jsonb_build_object('ok', true, 'attendance_id', p_attendance_id, 'edited_by', v_user);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hris_attendance_edit(uuid,timestamptz,timestamptz,numeric,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.hris_attendance_edit(uuid,timestamptz,timestamptz,numeric,text) TO authenticated;

-- ---------- 5. View hris_attendance_view (HRIS + Finance shared) ---------
CREATE OR REPLACE VIEW public.hris_attendance_view
WITH (security_invoker = true) AS
SELECT
  a.id                                            AS attendance_id,
  a.date,
  a.staff_id,
  up.full_name                                    AS staff_name,
  e.employee_id                                   AS employee_code,
  e.company_code,
  b.name                                          AS branch_name,
  b.slug                                          AS branch_slug,
  s.name                                          AS shift_name,
  s.start_time                                    AS shift_start_time,
  a.check_in_at,
  a.check_in_at_override,
  COALESCE(a.check_in_at_override, a.check_in_at) AS effective_check_in,
  a.check_out_at,
  a.check_out_at_override,
  COALESCE(a.check_out_at_override, a.check_out_at) AS effective_check_out,
  a.check_in_lat,
  a.check_in_lng,
  a.check_out_lat,
  a.check_out_lng,
  a.is_location_valid,
  a.selfie_in_url,
  a.selfie_out_url,
  a.late_minutes,
  a.late_deduction_idr,
  a.status,
  a.auto_checkout,
  a.manual_edited_by,
  a.manual_edited_at,
  a.edit_reason,
  a.created_at
FROM public.raos_attendance a
LEFT JOIN public.user_profiles up ON up.id = a.staff_id
LEFT JOIN public.employees e ON e.email = up.email
LEFT JOIN public.branches b ON b.id = a.branch_id
LEFT JOIN public.shifts s ON s.id = a.shift_id;

GRANT SELECT ON public.hris_attendance_view TO authenticated, service_role;

-- ---------- 6. View hris_gapok_proporsional_view ------------------------
-- Gapok = employees.salary_base * (hari_kerja / (jumlah_hari_bulan - libur))
CREATE OR REPLACE VIEW public.hris_gapok_proporsional_view
WITH (security_invoker = true) AS
WITH bulan_stats AS (
  SELECT
    date_trunc('month', a.date)::date AS bulan,
    a.staff_id,
    COUNT(DISTINCT a.date) FILTER (WHERE a.check_in_at IS NOT NULL) AS hari_masuk,
    SUM(COALESCE(a.late_deduction_idr, 0)) AS total_potongan_terlambat
  FROM public.raos_attendance a
  GROUP BY 1, 2
)
SELECT
  bs.bulan,
  bs.staff_id,
  up.full_name AS staff_name,
  e.employee_id AS employee_code,
  e.salary_base AS gapok_bulanan,
  bs.hari_masuk,
  (EXTRACT(DAYS FROM (date_trunc('month', bs.bulan) + INTERVAL '1 month - 1 day'))::int
   - COALESCE((SELECT value::int FROM public.system_config WHERE key='MONTHLY_LIBUR_DAYS'), 4)) AS hari_kerja_ideal,
  ROUND(e.salary_base * bs.hari_masuk::numeric / NULLIF(
    EXTRACT(DAYS FROM (date_trunc('month', bs.bulan) + INTERVAL '1 month - 1 day'))::int
      - COALESCE((SELECT value::int FROM public.system_config WHERE key='MONTHLY_LIBUR_DAYS'), 4),
    0)) AS gapok_proporsional,
  bs.total_potongan_terlambat,
  ROUND(e.salary_base * bs.hari_masuk::numeric / NULLIF(
    EXTRACT(DAYS FROM (date_trunc('month', bs.bulan) + INTERVAL '1 month - 1 day'))::int
      - COALESCE((SELECT value::int FROM public.system_config WHERE key='MONTHLY_LIBUR_DAYS'), 4),
    0)) - bs.total_potongan_terlambat AS gapok_final
FROM bulan_stats bs
LEFT JOIN public.user_profiles up ON up.id = bs.staff_id
LEFT JOIN public.employees e ON e.email = up.email;

GRANT SELECT ON public.hris_gapok_proporsional_view TO authenticated, service_role;

-- ---------- 7. Realtime publication (jaga-jaga kalau belum di-add) -------
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.raos_attendance;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
