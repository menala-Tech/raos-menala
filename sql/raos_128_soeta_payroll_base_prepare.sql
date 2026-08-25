-- ============================================================================
-- raos_128: SOETA payroll base prepare
-- ============================================================================
-- Creates canonical raos_payroll skeleton rows for SOETA only.
-- Dry-run by default.
-- Scope: canonical 43 linked SOETA staff (raos_soeta_staff_sheet_mirror).
-- Excludes: 7 preactivation and any non-mirror SOETA drift.
-- Does NOT use legacy payroll compute.
-- No bonus/kpi contamination; bonus_kpi = 0, bonus_saldo = 0.
-- Idempotent ON CONFLICT DO NOTHING.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.raos_soeta_payroll_base_prepare(
  p_month date,
  p_apply boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public.get_my_role();
  v_month date := date_trunc('month', p_month)::date;
  r record;
  v_count int := 0;
  v_inserted int := 0;
  v_already int := 0;
  v_affected jsonb := '[]'::jsonb;
BEGIN
  IF auth.role() <> 'service_role'
     AND v_role <> ALL (ARRAY['admin','direksi']) THEN
    RAISE EXCEPTION 'forbidden: admin/direksi or service_role required';
  END IF;

  IF p_month IS NULL THEN
    RAISE EXCEPTION 'month_required';
  END IF;

  -- Canonical SOETA linked staff only.
  FOR r IN
    SELECT
      up.id AS staff_id,
      COALESCE(up.gaji, 0)::int AS gapok,
      COALESCE(kt.member_parkir_amount, 0)::int AS member_parkir
    FROM public.raos_staff_master m
    JOIN public.raos_soeta_staff_sheet_mirror sm ON sm.staff_id = m.staff_id
    JOIN public.user_profiles up ON up.id = m.auth_user_id
    LEFT JOIN public.raos_kpi_targets_staff kt
      ON kt.staff_id = up.id AND kt.effective_month = v_month
    WHERE up.is_active = true
      AND up.role IN ('staff','koordinator')
      AND m.is_activated = true
      AND m.auth_user_id IS NOT NULL
    ORDER BY sm.staff_id
  LOOP
    v_count := v_count + 1;
    v_affected := v_affected || jsonb_build_array(r.staff_id);

    IF p_apply THEN
      INSERT INTO public.raos_payroll (
        staff_id, effective_month, gapok, bonus_saldo, bpjs, paket_data, member_parkir, bonus_kpi,
        target_pct, driver_active_pct, status_target, computed_by
      ) VALUES (
        r.staff_id, v_month, r.gapok, 0, 55000, 100000, r.member_parkir, 0,
        0, 0, 'ok', auth.uid()
      )
      ON CONFLICT (staff_id, effective_month) DO NOTHING;

      IF FOUND THEN
        v_inserted := v_inserted + 1;
      ELSE
        v_already := v_already + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'apply', p_apply,
    'month', v_month,
    'canonicalStaffCount', v_count,
    'insertedCount', v_inserted,
    'alreadyExistingCount', v_already,
    'affectedStaffIds', v_affected
  );
END;
$$;

REVOKE ALL ON FUNCTION public.raos_soeta_payroll_base_prepare(date,boolean)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.raos_soeta_payroll_base_prepare(date,boolean)
TO authenticated, service_role;

COMMENT ON FUNCTION public.raos_soeta_payroll_base_prepare(date,boolean) IS
'SOETA-only canonical payroll skeleton seeder. Dry-run by default. Uses canonical SSOT mirror; never legacy compute.';
