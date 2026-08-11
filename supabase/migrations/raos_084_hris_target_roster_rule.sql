-- FINAL business rule:
-- Target Staff/Cabang = ACTIVE Staff + Koordinator ONLY.
-- Admin/Management/Direksi/Driver are excluded from Target.
-- Payroll remains a separate rule.

CREATE OR REPLACE VIEW public.raos_hris_target_roster
WITH (security_invoker = true)
AS
WITH employee_roster AS (
  SELECT
    e.id AS employee_uuid,
    e.employee_id,
    e.full_name,
    e.position,
    e.branch AS hris_branch,
    e.salary_base,
    up.id AS user_id,
    up.role AS system_role,
    up.branch_id,
    b.name AS branch_name,
    b.slug AS branch_slug,
    CASE
      WHEN lower(trim(coalesce(up.role, e.position, ''))) IN ('koordinator', 'coordinator') THEN 'koordinator'
      WHEN lower(trim(coalesce(up.role, e.position, ''))) IN ('staff', 'staff konter', 'pickup point') THEN 'staff'
      WHEN lower(trim(coalesce(up.role, e.position, ''))) IN ('admin', 'administrator') THEN 'admin'
      WHEN lower(trim(coalesce(up.role, e.position, ''))) IN ('management', 'manajemen') THEN 'management'
      WHEN lower(trim(coalesce(up.role, e.position, ''))) IN ('direksi', 'direktur', 'direktur utama') THEN 'direksi'
      WHEN lower(trim(coalesce(up.role, e.position, ''))) = 'driver' THEN 'driver'
      ELSE lower(trim(coalesce(up.role, e.position, '')))
    END AS resolved_role
  FROM public.employees e
  LEFT JOIN public.user_profiles up
    ON up.staff_id = e.employee_id
   AND up.is_active = true
  LEFT JOIN public.branches b
    ON b.id = up.branch_id
  WHERE upper(coalesce(e.status,'')) = 'AKTIF'
)
SELECT
  employee_uuid,
  employee_id,
  full_name,
  position,
  hris_branch,
  salary_base,
  user_id,
  system_role,
  branch_id,
  branch_name,
  branch_slug,
  resolved_role,
  CASE
    WHEN user_id IS NULL THEN 'missing_user_profile'
    WHEN branch_id IS NULL THEN 'missing_branch_mapping'
    ELSE 'ready'
  END AS sync_status
FROM employee_roster
WHERE resolved_role IN ('staff', 'koordinator');

COMMENT ON VIEW public.raos_hris_target_roster IS
'Target roster canonical: ACTIVE Staff + Koordinator only. Admin/Management/Direksi/Driver excluded.';

GRANT SELECT ON public.raos_hris_target_roster TO authenticated;

CREATE OR REPLACE VIEW public.raos_hris_target_branch_roster
WITH (security_invoker = true)
AS
SELECT
  branch_id,
  coalesce(branch_name, hris_branch) AS branch_name,
  hris_branch,
  count(*)::integer AS active_target_people,
  count(*) FILTER (WHERE sync_status='ready')::integer AS ready_people,
  count(*) FILTER (WHERE sync_status<>'ready')::integer AS sync_issue_people
FROM public.raos_hris_target_roster
GROUP BY branch_id, branch_name, hris_branch;

GRANT SELECT ON public.raos_hris_target_branch_roster TO authenticated;

COMMENT ON VIEW public.raos_hris_target_branch_roster IS
'Target branch roster summary derived only from ACTIVE Staff + Koordinator.';
