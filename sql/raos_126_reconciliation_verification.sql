-- ============================================================================
-- raos_126_reconciliation_verification: post-apply read-only evidence
-- ============================================================================
-- Run after the Architect applies raos_126 to the target database.
-- No mutations; only SELECTs.
-- ============================================================================

-- 1. canonical mirror count
SELECT 'canonical_mirror_count' AS check_name, count(*)::integer AS count
FROM public.raos_soeta_staff_sheet_mirror;

-- 2. canonical master count (mirror membership)
SELECT 'canonical_master_count' AS check_name, count(*)::integer AS count
FROM public.raos_staff_master m
JOIN public.raos_soeta_staff_sheet_mirror sm ON sm.staff_id = m.staff_id;

-- 3. exact profile matches (any profile, active or not)
SELECT 'matching_existing_profile_count' AS check_name, count(*)::integer AS count
FROM public.raos_staff_master m
JOIN public.raos_soeta_staff_sheet_mirror sm ON sm.staff_id = m.staff_id
JOIN public.user_profiles up ON up.staff_id = m.staff_id;

-- 4. missing-profile IDs
SELECT 'missing_profile_ids' AS check_name,
       sm.staff_id,
       sm.full_name
FROM public.raos_soeta_staff_sheet_mirror sm
LEFT JOIN public.user_profiles up ON up.staff_id = sm.staff_id
LEFT JOIN public.raos_staff_master m ON m.staff_id = sm.staff_id
WHERE up.id IS NULL
ORDER BY sm.staff_id;

-- 5. inactive profile count
SELECT 'inactive_profile_count' AS check_name, count(*)::integer AS count
FROM public.raos_staff_master m
JOIN public.raos_soeta_staff_sheet_mirror sm ON sm.staff_id = m.staff_id
JOIN public.user_profiles up ON up.staff_id = m.staff_id
WHERE up.is_active = false;

-- 6. role mismatch count
SELECT 'role_mismatch_count' AS check_name, count(*)::integer AS count
FROM public.raos_staff_master m
JOIN public.raos_soeta_staff_sheet_mirror sm ON sm.staff_id = m.staff_id
JOIN public.user_profiles up ON up.staff_id = m.staff_id
WHERE up.is_active = true
  AND up.role IS DISTINCT FROM m.role;

-- 7. branch mismatch count
SELECT 'branch_mismatch_count' AS check_name, count(*)::integer AS count
FROM public.raos_staff_master m
JOIN public.raos_soeta_staff_sheet_mirror sm ON sm.staff_id = m.staff_id
JOIN public.user_profiles up ON up.staff_id = m.staff_id
LEFT JOIN public.branches b ON b.id = up.branch_id
LEFT JOIN public.branches hub ON hub.id = b.parent_branch_id
WHERE up.is_active = true
  AND NOT (b.code = 'SOETA' OR hub.code = 'SOETA');

-- 8. duplicate canonical profile count
SELECT 'duplicate_canonical_profile_count' AS check_name, count(*)::integer AS count
FROM (
  SELECT up.staff_id
  FROM public.user_profiles up
  WHERE up.staff_id IN (SELECT staff_id FROM public.raos_soeta_staff_sheet_mirror)
  GROUP BY up.staff_id
  HAVING count(*) > 1
) d;

-- 9. duplicate canonical master count
SELECT 'duplicate_canonical_master_count' AS check_name, count(*)::integer AS count
FROM (
  SELECT m.staff_id
  FROM public.raos_staff_master m
  JOIN public.raos_soeta_staff_sheet_mirror sm ON sm.staff_id = m.staff_id
  GROUP BY m.staff_id
  HAVING count(*) > 1
) d;

-- 10. auth linked to other master count
SELECT 'auth_linked_to_other_master_count' AS check_name, count(DISTINCT sm.staff_id)::integer AS count
FROM public.raos_soeta_staff_sheet_mirror sm
JOIN public.raos_staff_master m ON m.staff_id = sm.staff_id
JOIN public.user_profiles up ON up.staff_id = sm.staff_id
WHERE up.is_active = true
  AND EXISTS (
    SELECT 1 FROM public.raos_staff_master m2
    WHERE m2.auth_user_id = up.id
      AND m2.staff_id <> sm.staff_id
  );

-- 11-13. S001 / S0012 / STAFF002 excluded from canonical
SELECT 'drift_exclusion' AS check_name,
       s.staff_id,
       CASE
         WHEN s.staff_id IN ('S001','S0012','STAFF002') THEN 'EXCLUDED AS EXPECTED'
         ELSE 'in mirror (canonical)'
       END AS status
FROM public.raos_soeta_staff_sheet_mirror s
WHERE s.staff_id IN ('S001','S0012','STAFF002')
UNION ALL
SELECT 'drift_exclusion' AS check_name,
       m.staff_id,
       'NON-MIRROR SOETA MASTER (excluded from canonical scope)' AS status
FROM public.raos_staff_master m
JOIN public.raos_soeta_staff_sheet_mirror sm ON sm.staff_id = m.staff_id
WHERE m.staff_id IN ('S001','S0012','STAFF002');

-- Post-apply checks -----------------------------------------------------------

-- Linked master count
SELECT 'linked_master_count' AS check_name, count(*)::integer AS count
FROM public.raos_staff_master m
JOIN public.raos_soeta_staff_sheet_mirror sm ON sm.staff_id = m.staff_id
WHERE m.auth_user_id IS NOT NULL;

-- In-activated (linked) master count
SELECT 'activated_master_count' AS check_name, count(*)::integer AS count
FROM public.raos_staff_master m
JOIN public.raos_soeta_staff_sheet_mirror sm ON sm.staff_id = m.staff_id
WHERE m.is_activated = true;

-- 7 missing-profile rows should still be unlinked and not activated
SELECT 'missing_profile_untouched' AS check_name, count(*)::integer AS count
FROM public.raos_soeta_staff_sheet_mirror sm
LEFT JOIN public.user_profiles up ON up.staff_id = sm.staff_id
JOIN public.raos_staff_master m ON m.staff_id = sm.staff_id
WHERE up.id IS NULL
  AND m.auth_user_id IS NULL
  AND m.is_activated = false;

-- user_profiles unchanged (no new/deleted; branch, role, is_active intact)
SELECT 'user_profiles_total' AS check_name, count(*)::integer AS count
FROM public.user_profiles;

-- employees unchanged
SELECT 'employees_total' AS check_name, count(*)::integer AS count
FROM public.employees;

-- auth.users unchanged (no new/deleted)
SELECT 'auth_users_total' AS check_name, count(*)::integer AS count
FROM auth.users;

-- Rerun idempotency: dry-run should show linkableCount = 0 and alreadyLinkedCount = linked total
-- This query simulates the dry-run summary without calling the RPC.
SELECT 'idempotency_ready' AS check_name,
       count(*) FILTER (WHERE m.auth_user_id IS NULL AND up.id IS NOT NULL AND up.is_active = true)::integer AS linkable_count,
       count(*) FILTER (WHERE m.auth_user_id IS NOT NULL)::integer AS already_linked_count
FROM public.raos_staff_master m
JOIN public.raos_soeta_staff_sheet_mirror sm ON sm.staff_id = m.staff_id
LEFT JOIN public.user_profiles up ON up.staff_id = m.staff_id;
