-- raos_077 (2026-08-07): Poin 10+11 — auto-prorate target_staff_default
-- di RPC raos_compute_payroll_month.
--
-- Bug: kalau admin/direksi set Target Cabang tapi lupa isi Target Staff
-- Default, semua staff cabang tsb dapat target = 0 → pct = 0 → bonus = 0.
--
-- Fix: kalau raos_kpi_targets_branch.target_staff_default IS NULL dan
-- target_cabang > 0, hitung otomatis = target_cabang / jumlah staff aktif
-- (staff+koordinator) di cabang itu. Rumus sama dipakai GAS backend
-- (_finKpiTargetStaffList_) supaya UI dan RPC konsisten.
--
-- Perubahan hanya menambah blok "IF v_target_staff IS NULL OR = 0" setelah
-- override lookup. Sisanya identik dengan raos_070d.

CREATE OR REPLACE FUNCTION public.raos_compute_payroll_month(p_month date)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_processed int := 0;
  v_month_start date := date_trunc('month', p_month)::date;
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
  v_branch_staff_count int;
  v_effective_default bigint;
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

    SELECT * INTO v_target_cabang_row
    FROM public.raos_kpi_targets_branch
    WHERE branch_id = r.branch_id AND effective_month = v_month_start;

    -- Poin 10+11 (2026-08-07): hitung effective target_staff_default
    -- (auto-prorate kalau kolom NULL tapi target_cabang > 0).
    v_effective_default := v_target_cabang_row.target_staff_default;
    IF v_effective_default IS NULL AND COALESCE(v_target_cabang_row.target_cabang, 0) > 0 THEN
      SELECT COUNT(*)::int INTO v_branch_staff_count
      FROM public.user_profiles up2
      WHERE up2.branch_id = r.branch_id
        AND up2.is_active = true
        AND up2.role = ANY (ARRAY['staff','koordinator']);
      IF v_branch_staff_count > 0 THEN
        v_effective_default := ROUND(v_target_cabang_row.target_cabang::numeric / v_branch_staff_count::numeric)::bigint;
      END IF;
    END IF;

    SELECT target_saldo, member_parkir_amount INTO v_target_staff, v_member_parkir
    FROM public.raos_kpi_targets_staff
    WHERE staff_id = r.staff_id AND effective_month = v_month_start;

    IF v_target_staff IS NULL THEN
      v_target_staff := COALESCE(v_effective_default, 0);
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
          v_effective_default,
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
      member_parkir, bonus_kpi, target_pct, driver_active_pct, status_target,
      computed_at, computed_by
    )
    VALUES (
      r.staff_id, v_month_start, v_gapok, v_bonus_saldo, 55000, 100000,
      v_member_parkir, v_bonus_kpi, COALESCE(v_staff_pct, 0), COALESCE(v_driver_active_ratio, 0),
      v_status, now(), auth.uid()
    )
    ON CONFLICT (staff_id, effective_month) DO UPDATE SET
      gapok = EXCLUDED.gapok,
      bonus_saldo = EXCLUDED.bonus_saldo,
      bpjs = EXCLUDED.bpjs,
      paket_data = EXCLUDED.paket_data,
      member_parkir = EXCLUDED.member_parkir,
      bonus_kpi = EXCLUDED.bonus_kpi,
      target_pct = EXCLUDED.target_pct,
      driver_active_pct = EXCLUDED.driver_active_pct,
      status_target = EXCLUDED.status_target,
      computed_at = now(),
      computed_by = auth.uid();

    v_processed := v_processed + 1;
  END LOOP;

  RETURN v_processed;
END $$;

REVOKE ALL ON FUNCTION public.raos_compute_payroll_month(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.raos_compute_payroll_month(date) TO authenticated, service_role;

COMMENT ON FUNCTION public.raos_compute_payroll_month(date) IS 'raos_077: Hitung Bonus Saldo + Bonus KPI tier per staff, auto-prorate target_staff_default kalau NULL';
