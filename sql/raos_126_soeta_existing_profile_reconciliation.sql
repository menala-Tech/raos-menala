-- ============================================================================
-- raos_126: Reconcile existing active SOETA user_profiles with canonical Staff SSOT master
-- ============================================================================
-- Context:
--   * raos_124 imported 50 canonical Soeta staff into raos_staff_master.
--   * 43 of those staff already have live user_profiles (operational accounts).
--   * raos_124 deliberately does NOT create auth users, user_profiles, or
--     activate pre-activation master rows.
--   * raos_124 only updates user_profiles when a master row is already
--     is_activated=true AND has a resolved branch_id.
--
-- Root cause of the unlinked state:
--   1. raos_staff_master rows were inserted with is_activated=false and
--      terminal/branch_id=NULL because the canonical Sheet has no T1/T2/T3 yet.
--   2. raos_soeta_staff_sheet_sync explicitly refuses to link/create accounts:
--      * no Auth creation
--      * no user_profiles creation
--      * only updates user_profiles.branch_id for master rows that are already
--        is_activated=true AND have a non-null branch_id.
--
-- Business contract:
--   * Canonical SOETA staff = membership in public.raos_soeta_staff_sheet_mirror
--     (operational mirror of Google Sheet "Database Staff Soeta").
--   * Link ONLY exact canonical staff_id matches that already exist as active
--     user_profiles in the SOETA scope.
--   * Do NOT create auth.users, user_profiles, or employees.
--   * Do NOT delete, deactivate, or activate the missing-profile canonical staff.
--   * Do NOT overwrite user_profiles.branch_id, role, or other fields.
--   * Do NOT assign T1/T2/T3 — terminal assignment is intentionally blank.
--   * Do NOT touch HRIS drift (S001 / S0012); they are not in the canonical mirror.
--
-- is_activated semantics:
--   * raos_staff_master_link_auth sets is_activated=true when a real auth user
--     is linked and the master row is fully branch-resolved.
--   * For the existing operational accounts, the real auth user already exists,
--     so linking implies activation. We set is_activated=true but we do NOT
--     require branch_id to be non-null, and we do NOT overwrite user_profiles.branch_id.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.raos_soeta_reconcile_existing_profiles(
  p_apply boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public.get_my_role();
  v_canonical integer := 0;
  v_missing_master integer := 0;
  v_duplicate_master integer := 0;
  v_duplicate_profile integer := 0;
  v_role_mismatch integer := 0;
  v_branch_mismatch integer := 0;
  v_auth_linked_to_other integer := 0;
  v_already integer := 0;
  v_matching integer := 0;
  v_inactive integer := 0;
  v_linkable integer := 0;
  v_missing integer := 0;
  v_updated integer := 0;
  v_affected jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  r record;
BEGIN
  IF auth.role() <> 'service_role'
     AND v_role <> ALL (ARRAY['admin','direksi']) THEN
    RAISE EXCEPTION 'forbidden: admin/direksi or service_role required';
  END IF;

  -- ---------- 1. Structural fail-closed checks (canonical mirror scope) -----

  -- Duplicate master: a canonical mirror staff_id mapped to >1 master row.
  SELECT count(*) INTO v_duplicate_master
  FROM (
    SELECT m.staff_id
    FROM public.raos_staff_master m
    JOIN public.raos_soeta_staff_sheet_mirror sm ON sm.staff_id = m.staff_id
    GROUP BY m.staff_id
    HAVING count(*) > 1
  ) d;

  -- Missing master: a canonical mirror staff_id not present in raos_staff_master.
  SELECT count(*) INTO v_missing_master
  FROM public.raos_soeta_staff_sheet_mirror sm
  WHERE NOT EXISTS (
    SELECT 1 FROM public.raos_staff_master m WHERE m.staff_id = sm.staff_id
  );

  -- Duplicate profile: a canonical staff_id has >1 user_profiles row.
  SELECT count(*) INTO v_duplicate_profile
  FROM (
    SELECT up.staff_id
    FROM public.user_profiles up
    WHERE up.staff_id IN (
      SELECT staff_id FROM public.raos_soeta_staff_sheet_mirror
    )
    GROUP BY up.staff_id
    HAVING count(*) > 1
  ) d;

  -- Role mismatch for an existing active canonical profile.
  SELECT count(*) INTO v_role_mismatch
  FROM public.raos_soeta_staff_sheet_mirror sm
  JOIN public.raos_staff_master m ON m.staff_id = sm.staff_id
  JOIN public.user_profiles up ON up.staff_id = sm.staff_id
  WHERE up.is_active = true
    AND up.role IS DISTINCT FROM m.role;

  -- Branch scope mismatch for an existing active canonical profile.
  SELECT count(*) INTO v_branch_mismatch
  FROM public.raos_soeta_staff_sheet_mirror sm
  JOIN public.raos_staff_master m ON m.staff_id = sm.staff_id
  JOIN public.user_profiles up ON up.staff_id = sm.staff_id
  LEFT JOIN public.branches b ON b.id = up.branch_id
  LEFT JOIN public.branches hub ON hub.id = b.parent_branch_id
  WHERE up.is_active = true
    AND NOT (b.code = 'SOETA' OR hub.code = 'SOETA');

  -- Auth user already linked to a different master.
  SELECT count(DISTINCT sm.staff_id) INTO v_auth_linked_to_other
  FROM public.raos_soeta_staff_sheet_mirror sm
  JOIN public.raos_staff_master m ON m.staff_id = sm.staff_id
  JOIN public.user_profiles up ON up.staff_id = sm.staff_id
  WHERE up.is_active = true
    AND EXISTS (
      SELECT 1 FROM public.raos_staff_master m2
      WHERE m2.auth_user_id = up.id
        AND m2.staff_id <> sm.staff_id
    );

  IF v_duplicate_master > 0
     OR v_missing_master > 0
     OR v_duplicate_profile > 0
     OR v_role_mismatch > 0
     OR v_branch_mismatch > 0
     OR v_auth_linked_to_other > 0 THEN
    RAISE EXCEPTION 'reconciliation_blocked: missing_master=%, duplicate_master=%, duplicate_profile=%, role_mismatch=%, branch_mismatch=%, auth_linked_to_other=%',
      v_missing_master, v_duplicate_master, v_duplicate_profile,
      v_role_mismatch, v_branch_mismatch, v_auth_linked_to_other;
  END IF;

  -- ---------- 2. Canonical counts -----------------------------------------

  SELECT count(*) INTO v_canonical
  FROM public.raos_staff_master m
  JOIN public.raos_soeta_staff_sheet_mirror sm ON sm.staff_id = m.staff_id;

  SELECT count(*) INTO v_already
  FROM public.raos_staff_master m
  JOIN public.raos_soeta_staff_sheet_mirror sm ON sm.staff_id = m.staff_id
  WHERE m.auth_user_id IS NOT NULL;

  -- ---------- 3. Iterate canonical master + apply -------------------------

  FOR r IN
    SELECT
      m.staff_id,
      m.auth_user_id AS master_auth,
      up.id AS profile_id,
      up.is_active AS profile_active
    FROM public.raos_staff_master m
    JOIN public.raos_soeta_staff_sheet_mirror sm ON sm.staff_id = m.staff_id
    LEFT JOIN public.user_profiles up ON up.staff_id = m.staff_id
    ORDER BY m.staff_id
    FOR UPDATE OF m
  LOOP
    IF r.profile_id IS NULL THEN
      v_missing := v_missing + 1;
      v_skipped := v_skipped || jsonb_build_array(r.staff_id);
      CONTINUE;
    END IF;

    v_matching := v_matching + 1;

    IF r.master_auth IS NOT NULL THEN
      CONTINUE;
    END IF;

    IF NOT r.profile_active THEN
      v_inactive := v_inactive + 1;
      v_skipped := v_skipped || jsonb_build_array(r.staff_id);
      CONTINUE;
    END IF;

    v_linkable := v_linkable + 1;
    v_affected := v_affected || jsonb_build_array(r.staff_id);

    IF p_apply THEN
      UPDATE public.raos_staff_master
      SET auth_user_id = r.profile_id,
          is_activated = true,
          activated_at = now(),
          updated_at = now()
      WHERE staff_id = r.staff_id
        AND auth_user_id IS NULL;

      IF FOUND THEN
        v_updated := v_updated + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'apply', p_apply,
    'canonicalMasterCount', v_canonical,
    'missingMasterCount', v_missing_master,
    'duplicateMasterCount', v_duplicate_master,
    'duplicateProfileCount', v_duplicate_profile,
    'matchingExistingProfileCount', v_matching,
    'alreadyLinkedCount', v_already,
    'linkableCount', v_linkable,
    'missingProfileCount', v_missing,
    'inactiveProfileCount', v_inactive,
    'roleMismatchCount', v_role_mismatch,
    'branchMismatchCount', v_branch_mismatch,
    'authUserLinkedToOtherCount', v_auth_linked_to_other,
    'updatedCount', v_updated,
    'affectedStaffIds', v_affected,
    'skippedStaffIds', v_skipped
  );
END;
$$;

REVOKE ALL ON FUNCTION public.raos_soeta_reconcile_existing_profiles(boolean)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.raos_soeta_reconcile_existing_profiles(boolean)
TO authenticated, service_role;

COMMENT ON FUNCTION public.raos_soeta_reconcile_existing_profiles(boolean) IS
'Dry-run/apply reconciliation of existing active user_profiles into canonical SOETA raos_staff_master (mirror-derived). No Auth/profiles creation, no deactivation, no branch overwrite.';
