-- ============================================================================
-- raos_payroll_readiness_diagnostic: explain WHY each SOETA staff is not payrollReady
-- ============================================================================
-- Run as admin/service_role. Read-only.
-- Replace the month literal in the params CTE as needed.
-- ============================================================================

WITH params AS (
  SELECT '2026-08-01'::date AS v_month
),
canonical_staff AS (
  SELECT
    m.staff_id,
    m.full_name,
    up.id AS user_id,
    up.full_name AS profile_name,
    up.is_active,
    up.role
  FROM public.raos_staff_master m
  JOIN public.raos_soeta_staff_sheet_mirror sm ON sm.staff_id = m.staff_id
  LEFT JOIN public.user_profiles up ON up.staff_id = m.staff_id
  WHERE up.is_active = true
),
kpi_preview AS (
  SELECT
    c.staff_id,
    c.full_name,
    c.user_id,
    c.profile_name,
    (preview->>'payrollReady')::boolean AS payroll_ready,
    (preview->>'kpiScore')::numeric AS kpi_score,
    (preview->>'proposedBonusKpi')::integer AS proposed_bonus_kpi,
    preview->'kpi' AS kpi
  FROM canonical_staff c
  CROSS JOIN params p
  CROSS JOIN LATERAL public.raos_soeta_payroll_kpi_preview(c.user_id, p.v_month) AS preview
),
manual_inputs AS (
  SELECT
    c.user_id,
    c.staff_id,
    mi.sop_score,
    mi.coaching_score,
    mi.coordinator_score
  FROM canonical_staff c
  CROSS JOIN params p
  LEFT JOIN public.raos_soeta_kpi_manual_inputs mi
    ON mi.staff_id = c.user_id
   AND mi.effective_month = p.v_month
)
SELECT
  k.staff_id,
  k.full_name,
  k.user_id,
  k.payroll_ready,
  k.kpi_score,
  k.proposed_bonus_kpi,
  (k.kpi->'pillars'->'order'->>'target')::numeric AS target_order,
  (k.kpi->'pillars'->'order'->>'realized')::numeric AS order_realized,
  (k.kpi->'pillars'->'gmv'->>'target')::numeric AS target_gmv,
  (k.kpi->'pillars'->'gmv'->>'realized')::numeric AS gmv_realized,
  (k.kpi->'pillars'->'attendance'->>'expectedDays')::integer AS expected_days,
  (k.kpi->'pillars'->'attendance'->>'attendedDays')::integer AS attended_days,
  (k.kpi->'pillars'->'sop'->>'pct')::numeric AS sop_pct,
  (k.kpi->'pillars'->'driverCoaching'->>'pct')::numeric AS coaching_pct,
  (k.kpi->'pillars'->'coordinatorAssessment'->>'pct')::numeric AS coordinator_pct,
  COALESCE(m.sop_score, 0) AS sop_manual,
  COALESCE(m.coaching_score, 0) AS coaching_manual,
  COALESCE(m.coordinator_score, 0) AS coordinator_manual,
  CONCAT_WS(
    ', ',
    CASE WHEN (k.kpi->'pillars'->'order'->>'target')::numeric <= 0 THEN 'target_order' END,
    CASE WHEN (k.kpi->'pillars'->'gmv'->>'target')::numeric <= 0 THEN 'target_gmv' END,
    CASE WHEN (k.kpi->'pillars'->'attendance'->>'expectedDays')::integer <= 0 THEN 'attendance_schedule' END,
    CASE WHEN m.sop_score IS NULL THEN 'sop_manual' END,
    CASE WHEN m.coaching_score IS NULL THEN 'driver_coaching_manual' END,
    CASE WHEN m.coordinator_score IS NULL THEN 'coordinator_assessment_manual' END
  ) AS missing_pillars
FROM kpi_preview k
LEFT JOIN manual_inputs m ON m.user_id = k.user_id AND m.staff_id = k.staff_id
ORDER BY k.staff_id;
