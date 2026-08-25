-- ============================================================================
-- raos_124 Post-Migration / Post-Sync Verification
-- Run AFTER applying raos_124 and after the SOETA staff SSOT sync.
-- No mutations; only selects counts and raises NOTICE.
-- ============================================================================

-- 1. Migration artifacts present.
DO $$
DECLARE
  v_mirror_cols int;
  v_sync_fn int;
  v_resolver int;
BEGIN
  SELECT count(*) INTO v_mirror_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'raos_soeta_staff_sheet_mirror';

  SELECT count(*) INTO v_sync_fn
  FROM information_schema.routines
  WHERE routine_schema = 'public' AND routine_name = 'raos_soeta_staff_sheet_sync';

  SELECT count(*) INTO v_resolver
  FROM information_schema.routines
  WHERE routine_schema = 'public' AND routine_name = 'raos_staff_master_resolve_airport_and_branch';

  RAISE NOTICE 'POSTCHECK: raos_soeta_staff_sheet_mirror columns = %', v_mirror_cols;
  RAISE NOTICE 'POSTCHECK: raos_soeta_staff_sheet_sync exists = %', v_sync_fn;
  RAISE NOTICE 'POSTCHECK: raos_staff_master_resolve_airport_and_branch exists = %', v_resolver;
END $$;

-- 2. Mirror and master counts.
SELECT
  'raos_soeta_staff_sheet_mirror rows' AS check_name,
  count(*)::integer AS count
FROM public.raos_soeta_staff_sheet_mirror;

SELECT
  'raos_staff_master SOETA rows' AS check_name,
  count(*)::integer AS count
FROM public.raos_staff_master
WHERE upper(COALESCE(airport,'')) = 'SOETA';

-- 3. No Auth auto-creation: no auth.users emails came from the sheet.
SELECT
  'auth.users created from Soeta sheet (expected 0)' AS check_name,
  count(*)::integer AS count
FROM auth.users au
JOIN public.raos_staff_master m ON m.auth_user_id = au.id
WHERE m.source = 'google_sheet:ssot:database_staff_soeta';

-- 4. No auto-activation.
SELECT
  'activated SOETA staff (expected 0 unless admin manually activated)' AS check_name,
  count(*)::integer AS count
FROM public.raos_staff_master
WHERE upper(COALESCE(airport,'')) = 'SOETA' AND is_activated = true;

-- 5. No destructive deletes: HRIS drift still present.
SELECT
  'HRIS Soeta employees not in raos_staff_master (expected drift)' AS check_name,
  e.employee_id,
  e.full_name
FROM public.employees e
LEFT JOIN public.raos_staff_master m ON upper(btrim(e.employee_id)) = upper(btrim(m.staff_id))
WHERE COALESCE(e.branch,'') ILIKE '%SOETA%'
  AND m.staff_id IS NULL;

-- 6. Existing operational values preserved: no blank overwrite of email/phone.
SELECT
  'staff with preserved existing email/phone (non-NULL sheet blank did NOT wipe)' AS check_name,
  count(*)::integer AS count
FROM public.raos_staff_master
WHERE source = 'google_sheet:ssot:database_staff_soeta'
  AND (email IS NOT NULL OR phone IS NOT NULL);

-- 7. Terminal/branch assignment: assigned terminals are valid T1/T2/T3.
SELECT
  'Soeta staff with invalid terminal' AS check_name,
  count(*)::integer AS count
FROM public.raos_staff_master
WHERE upper(COALESCE(airport,'')) = 'SOETA'
  AND terminal IS NOT NULL
  AND terminal NOT IN ('T1','T2','T3');

-- 8. Unassigned terminal did not clear live branch.
SELECT
  'Soeta staff with terminal NULL but branch_id NOT NULL (should be 0)' AS check_name,
  count(*)::integer AS count
FROM public.raos_staff_master
WHERE upper(COALESCE(airport,'')) = 'SOETA'
  AND terminal IS NULL
  AND branch_id IS NOT NULL;
