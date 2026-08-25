-- ============================================================================
-- raos_128: SOETA payroll base prepare (Round 2B)
-- ============================================================================
-- Creates canonical raos_payroll skeleton rows for SOETA only.
-- Dry-run by default.
-- Scope: canonical 43 linked/activated SOETA staff.
-- Excludes: 7 preactivation, drift, non-SOETA, unlinked, inactive, etc.
-- Does NOT use legacy payroll compute.
-- New rows are unassessed: status_target='na'.
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
  v_canonical_master int := 0;
  v_linked_active int := 0;
  v_missing_profile int := 0;
  v_inactive int := 0;
  v_not_activated int := 0;
  v_non_soeta_branch int := 0;
  v_dup_master int := 0;
  v_dup_profile int := 0;
  v_auth_wrong int := 0;
  v_existing_payroll int := 0;
  v_rows_to_create int := 0;
  v_rows_to_skip int := 0;
  v_inserted int := 0;
  v_already int := 0;
  v_affected jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_blockers jsonb := '[]'::jsonb;
  r record;
BEGIN
  IF auth.role() <> 'service_role'
     AND v_role <> ALL (ARRAY['admin','direksi']) THEN
    RAISE EXCEPTION 'forbidden: admin/direksi or service_role required';
  END IF;

  IF p_month IS NULL THEN
    RAISE EXCEPTION 'month_required';
  END IF;

  -- ---------- Canonical counts and structural blockers ----------------------

  SELECT count(*) INTO v_canonical_master
  FROM public.raos_soeta_staff_sheet_mirror;

  SELECT count(*) INTO v_dup_master
  FROM (
    SELECT m.staff_id
    FROM public.raos_staff_master m
    JOIN public.raos_soeta_staff_sheet_mirror sm ON sm.staff_id = m.staff_id
    GROUP BY m.staff_id
    HAVING count(*) > 1
  ) d;

  SELECT count(*) INTO v_dup_profile
  FROM (
    SELECT up.staff_id
    FROM public.user_profiles up
    WHERE up.staff_id IN (SELECT staff_id FROM public.raos_soeta_staff_sheet_mirror)
    GROUP BY up.staff_id
    HAVING count(*) > 1
  ) d;

  SELECT count(*) INTO v_auth_wrong
  FROM public.raos_staff_master m
  JOIN public.raos_soeta_staff_sheet_mirror sm ON sm.staff_id = m.staff_id
  WHERE m.auth_user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = m.auth_user_id AND up.staff_id = m.staff_id
    );

  SELECT count(*) INTO v_inactive
  FROM public.raos_staff_master m
  JOIN public.raos_soeta_staff_sheet_mirror sm ON sm.staff_id = m.staff_id
  JOIN public.user_profiles up ON up.id = m.auth_user_id
  WHERE up.is_active = false;

  SELECT count(*) INTO v_not_activated
  FROM public.raos_staff_master m
  JOIN public.raos_soeta_staff_sheet_mirror sm ON sm.staff_id = m.staff_id
  WHERE m.auth_user_id IS NOT NULL
    AND m.is_activated = false;

  SELECT count(*) INTO v_non_soeta_branch
  FROM public.raos_staff_master m
  JOIN public.raos_soeta_staff_sheet_mirror sm ON sm.staff_id = m.staff_id
  JOIN public.user_profiles up ON up.id = m.auth_user_id
  LEFT JOIN public.branches b ON b.id = up.branch_id
  LEFT JOIN public.branches hub ON hub.id = b.parent_branch_id
  WHERE NOT (b.code = 'SOETA' OR hub.code = 'SOETA');

  IF v_dup_master > 0 THEN v_blockers := v_blockers || jsonb_build_array('duplicate_canonical_master'); END IF;
  IF v_dup_profile > 0 THEN v_blockers := v_blockers || jsonb_build_array('duplicate_canonical_profile'); END IF;
  IF v_auth_wrong > 0 THEN v_blockers := v_blockers || jsonb_build_array('auth_linked_to_wrong_master'); END IF;
  IF v_inactive > 0 THEN v_blockers := v_blockers || jsonb_build_array('inactive_linked_profile'); END IF;
  IF v_not_activated > 0 THEN v_blockers := v_blockers || jsonb_build_array('linked_master_not_activated'); END IF;
  IF v_non_soeta_branch > 0 THEN v_blockers := v_blockers || jsonb_build_array('non_soeta_profile_branch'); END IF;

  -- No apply if structural blockers exist.
  IF jsonb_array_length(v_blockers) > 0 THEN
    RAISE EXCEPTION 'reconciliation_blocked: %', v_blockers;
  END IF;

  -- ---------- Operational scope: linked, active, SOETA, staff/koord ---------

  SELECT count(*) INTO v_linked_active
  FROM public.raos_staff_master m
  JOIN public.raos_soeta_staff_sheet_mirror sm ON sm.staff_id = m.staff_id
  JOIN public.user_profiles up ON up.id = m.auth_user_id
  LEFT JOIN public.branches b ON b.id = up.branch_id
  LEFT JOIN public.branches hub ON hub.id = b.parent_branch_id
  WHERE m.is_activated = true
    AND m.auth_user_id IS NOT NULL
    AND up.is_active = true
    AND up.role IN ('staff','koordinator')
    AND (b.code = 'SOETA' OR hub.code = 'SOETA');

  v_missing_profile := v_canonical_master - v_linked_active;

  SELECT count(*) INTO v_existing_payroll
  FROM public.raos_payroll p
  WHERE p.effective_month = v_month
    AND p.staff_id IN (
      SELECT up.id
      FROM public.raos_staff_master m
      JOIN public.raos_soeta_staff_sheet_mirror sm ON sm.staff_id = m.staff_id
      JOIN public.user_profiles up ON up.id = m.auth_user_id
      LEFT JOIN public.branches b ON b.id = up.branch_id
      LEFT JOIN public.branches hub ON hub.id = b.parent_branch_id
      WHERE m.is_activated = true
        AND m.auth_user_id IS NOT NULL
        AND up.is_active = true
        AND up.role IN ('staff','koordinator')
        AND (b.code = 'SOETA' OR hub.code = 'SOETA')
    );

  v_rows_to_create := v_linked_active - v_existing_payroll;
  v_rows_to_skip := v_canonical_master - v_linked_active;

  -- ---------- Dry-run / apply loop -----------------------------------------

  FOR r IN
    SELECT
      up.id AS staff_id,
      up.full_name,
      m.staff_id AS mirror_staff_id,
      COALESCE(up.gaji, 0)::int AS gapok,
      COALESCE(kt.member_parkir_amount, 0)::int AS member_parkir
    FROM public.raos_staff_master m
    JOIN public.raos_soeta_staff_sheet_mirror sm ON sm.staff_id = m.staff_id
    JOIN public.user_profiles up ON up.id = m.auth_user_id
    LEFT JOIN public.raos_kpi_targets_staff kt
      ON kt.staff_id = up.id AND kt.effective_month = v_month
    LEFT JOIN public.branches b ON b.id = up.branch_id
    LEFT JOIN public.branches hub ON hub.id = b.parent_branch_id
    WHERE m.is_activated = true
      AND m.auth_user_id IS NOT NULL
      AND up.is_active = true
      AND up.role IN ('staff','koordinator')
      AND (b.code = 'SOETA' OR hub.code = 'SOETA')
    ORDER BY sm.staff_id
  LOOP
    v_affected := v_affected || jsonb_build_array(jsonb_build_object(
      'staff_id', r.staff_id,
      'mirror_staff_id', r.mirror_staff_id,
      'full_name', r.full_name,
      'gapok', r.gapok,
      'member_parkir', r.member_parkir
    ));

    IF p_apply THEN
      INSERT INTO public.raos_payroll (
        staff_id, effective_month, gapok, bonus_saldo, bpjs, paket_data, member_parkir, bonus_kpi,
        target_pct, driver_active_pct, status_target, computed_by
      ) VALUES (
        r.staff_id, v_month, r.gapok, 0, 55000, 100000, r.member_parkir, 0,
        0, 0, 'na', auth.uid()
      )
      ON CONFLICT (staff_id, effective_month) DO NOTHING;

      IF FOUND THEN
        v_inserted := v_inserted + 1;
      ELSE
        v_already := v_already + 1;
      END IF;
    END IF;
  END LOOP;

  -- Skipped staff (preactivation, drift)
  FOR r IN
    SELECT sm.staff_id
    FROM public.raos_soeta_staff_sheet_mirror sm
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.raos_staff_master m
      JOIN public.user_profiles up ON up.id = m.auth_user_id
      WHERE m.staff_id = sm.staff_id
        AND m.is_activated = true
        AND m.auth_user_id IS NOT NULL
        AND up.is_active = true
        AND up.role IN ('staff','koordinator')
    )
    ORDER BY sm.staff_id
  LOOP
    v_skipped := v_skipped || jsonb_build_array(r.staff_id);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'apply', p_apply,
    'month', v_month,
    'canonicalMasterCount', v_canonical_master,
    'linkedActiveCount', v_linked_active,
    'missingProfileCount', v_missing_profile,
    'existingPayrollRows', v_existing_payroll,
    'rowsToCreate', v_rows_to_create,
    'rowsToSkip', v_rows_to_skip,
    'insertedCount', v_inserted,
    'alreadyExistingCount', v_already,
    'affectedStaffIds', v_affected,
    'skippedStaffIds', v_skipped,
    'componentPolicy', jsonb_build_object(
      'gapokSource', 'user_profiles.gaji',
      'bpjsPolicy', 55000,
      'paketDataPolicy', 100000,
      'memberParkirSource', 'raos_kpi_targets_staff.member_parkir_amount fallback 0',
      'bonusSaldoPolicy', '0 for SOETA order mode',
      'bonusKpiPolicy', '0 until six-pillar cutover',
      'statusTargetPolicy', 'na until KPI assessed'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.raos_soeta_payroll_base_prepare(date,boolean)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.raos_soeta_payroll_base_prepare(date,boolean)
TO authenticated, service_role;

COMMENT ON FUNCTION public.raos_soeta_payroll_base_prepare(date,boolean) IS
'SOETA-only canonical payroll skeleton seeder. Dry-run by default. Returns exact rows that would be inserted. Uses canonical SSOT mirror; never legacy compute; status_target=na until KPI cutover.';
