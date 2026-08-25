-- ============================================================================
-- raos_124 Preflight / Dry-Run Evidence
-- Run BEFORE applying raos_124 to the target database.
-- No mutations; only raises NOTICE / selects counts.
-- ============================================================================

-- 1. Verify raos_124 has NOT already been applied.
DO $$
DECLARE
  v_mirror_exists boolean;
  v_sync_fn_exists boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'raos_soeta_staff_sheet_mirror'
  ) INTO v_mirror_exists;

  SELECT EXISTS(
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema = 'public' AND routine_name = 'raos_soeta_staff_sheet_sync'
  ) INTO v_sync_fn_exists;

  IF v_mirror_exists THEN
    RAISE NOTICE 'PREFLIGHT: raos_soeta_staff_sheet_mirror already exists.';
  ELSE
    RAISE NOTICE 'PREFLIGHT: raos_soeta_staff_sheet_mirror absent — safe to create.';
  END IF;

  IF v_sync_fn_exists THEN
    RAISE NOTICE 'PREFLIGHT: raos_soeta_staff_sheet_sync already exists.';
  ELSE
    RAISE NOTICE 'PREFLIGHT: raos_soeta_staff_sheet_sync absent — safe to create.';
  END IF;
END $$;

-- 2. Count expected baseline (matches current production preflight).
SELECT
  'raos_staff_master SOETA' AS check_name,
  count(*)::integer AS count
FROM public.raos_staff_master
WHERE upper(COALESCE(airport,'')) = 'SOETA';

SELECT
  'HRIS SOETA unique employee_id' AS check_name,
  count(DISTINCT upper(btrim(employee_id)))::integer AS count
FROM public.employees
WHERE COALESCE(branch,'') ILIKE '%SOETA%'
  AND NULLIF(btrim(employee_id),'') IS NOT NULL;

SELECT
  'branches SOETA hub' AS check_name,
  count(*)::integer AS count
FROM public.branches
WHERE code = 'SOETA' AND parent_branch_id IS NULL AND is_active = true;

SELECT
  'branches SOETA T1/T2/T3 active' AS check_name,
  count(*)::integer AS count
FROM public.branches b
JOIN public.branches hub ON hub.id = b.parent_branch_id
WHERE hub.code = 'SOETA' AND b.code IN ('T1','T2','T3') AND b.is_active = true;

-- 3. Duplication / drift preflight.
SELECT
  'raos_staff_master duplicate staff_id' AS check_name,
  count(*)::integer AS count
FROM (
  SELECT staff_id
  FROM public.raos_staff_master
  GROUP BY staff_id
  HAVING count(*) > 1
) d;

SELECT
  'HRIS SOETA duplicate employee_id' AS check_name,
  count(*)::integer AS count
FROM (
  SELECT upper(btrim(employee_id)) AS employee_id
  FROM public.employees
  WHERE COALESCE(branch,'') ILIKE '%SOETA%'
    AND NULLIF(btrim(employee_id),'') IS NOT NULL
  GROUP BY upper(btrim(employee_id))
  HAVING count(*) > 1
) d;

-- 4. HRIS drift rows expected outside canonical 50 (S001, S0012, etc.).
SELECT
  'HRIS Soeta employee_ids' AS check_name,
  upper(btrim(employee_id)) AS employee_id,
  full_name
FROM public.employees
WHERE COALESCE(branch,'') ILIKE '%SOETA%'
  AND NULLIF(btrim(employee_id),'') IS NOT NULL
ORDER BY upper(btrim(employee_id));
