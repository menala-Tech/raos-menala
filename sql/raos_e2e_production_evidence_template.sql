-- ============================================================================
-- raos_e2e_production_evidence_template: one canonical SOETA staff + one month
-- ============================================================================
-- Replace <SAMPLE_STAFF_UUID> and <YYYY-MM-DD> before running.
-- Read-only. Returns the evidence fields the Architect should verify manually.
-- ============================================================================

WITH params AS (
  SELECT
    '<SAMPLE_STAFF_UUID>'::uuid AS v_staff_id,   -- user_profiles.id (auth_user_id)
    '<YYYY-MM-DD>'::date AS v_month
)
SELECT
  'Target' AS gate,
  bt.target_cabang,
  bt.target_staff_default,
  st.target_order,
  st.target_gmv,
  bt.mode
FROM public.raos_kpi_targets_branch bt
LEFT JOIN public.raos_kpi_targets_staff st
  ON st.staff_id = (SELECT v_staff_id FROM params)
 AND st.effective_month = (SELECT v_month FROM params)
WHERE bt.branch_id = (
  SELECT up.branch_id
  FROM public.user_profiles up
  WHERE up.id = (SELECT v_staff_id FROM params)
)
  AND bt.effective_month = (SELECT v_month FROM params);

SELECT
  'Order/GMV' AS gate,
  count(*)::integer AS valid_orders,
  COALESCE(sum(s.gmv), 0)::numeric AS gmv_realized
FROM public.scan_orders s
CROSS JOIN params p
WHERE s.staff_id = p.v_staff_id
  AND s.status = 'valid'
  AND s.scanned_at >= p.v_month::timestamp AT TIME ZONE 'Asia/Jakarta'
  AND s.scanned_at < (p.v_month + interval '1 month')::timestamp AT TIME ZONE 'Asia/Jakarta';

SELECT
  'Attendance' AS gate,
  count(DISTINCT a.date)::integer AS attended_days
FROM public.raos_attendance a
CROSS JOIN params p
WHERE a.staff_id = p.v_staff_id
  AND a.date >= p.v_month
  AND a.date < (p.v_month + interval '1 month')::date
  AND a.check_in_at IS NOT NULL;

SELECT
  'KPI Snapshot' AS gate,
  kpi->>'complete' AS payroll_ready,
  kpi->>'score' AS kpi_score,
  kpi->'pillars' AS pillars
FROM params p,
LATERAL public.raos_soeta_kpi_staff_snapshot(p.v_staff_id, p.v_month) AS kpi;

SELECT
  'Manual KPI Inputs' AS gate,
  mi.sop_score,
  mi.coaching_score,
  mi.coordinator_score,
  mi.updated_by,
  mi.updated_at
FROM public.raos_soeta_kpi_manual_inputs mi
CROSS JOIN params p
WHERE mi.staff_id = p.v_staff_id
  AND mi.effective_month = p.v_month;

SELECT
  'Payroll' AS gate,
  pp.*
FROM params p,
LATERAL public.raos_soeta_payroll_kpi_preview(p.v_staff_id, p.v_month) AS pp;

SELECT
  'Finance (RIFIM) expected evidence' AS gate,
  'Target Staff uses target_order' AS assertion_1,
  'payroll bonus_kpi matches KPI tier' AS assertion_2,
  'Finance reads same canonical payroll values' AS assertion_3;

SELECT
  'No duplicates / correct scope' AS gate,
  (SELECT count(*)::integer FROM public.raos_staff_master WHERE staff_id = (SELECT staff_id FROM public.user_profiles WHERE id = (SELECT v_staff_id FROM params))) AS master_for_profile,
  (SELECT count(*)::integer FROM public.user_profiles WHERE id = (SELECT v_staff_id FROM params)) AS profiles_for_id,
  (SELECT count(*)::integer FROM public.employees WHERE employee_id = (SELECT staff_id FROM public.user_profiles WHERE id = (SELECT v_staff_id FROM params))) AS hris_for_staff;
