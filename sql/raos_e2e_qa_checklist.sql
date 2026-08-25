-- ============================================================================
-- raos_e2e_qa_checklist: one canonical SOETA staff + one month end-to-end
-- Replace <SAMPLE_STAFF_UUID> and <YYYY-MM-DD> before running.
-- No mutations; read-only verification.
-- ============================================================================

-- 1. Target Cabang / Target Staff
SELECT
  'Target Cabang/Staff' AS gate,
  bt.branch_id,
  bt.target_cabang,
  bt.target_staff_default,
  st.target_order,
  st.target_saldo,
  bt.mode
FROM public.raos_kpi_targets_branch bt
LEFT JOIN public.raos_kpi_targets_staff st ON st.staff_id = '<SAMPLE_STAFF_UUID>'
WHERE bt.branch_id = (SELECT branch_id FROM public.raos_staff_master WHERE staff_id = '<SAMPLE_STAFF_UUID>')
  AND bt.effective_month = '<YYYY-MM-DD>'::date;

-- 2. Scan Order / GMV
SELECT
  'Scan Order/GMV' AS gate,
  count(*)::integer AS valid_orders,
  COALESCE(sum(gmv), 0)::numeric AS gmv
FROM public.scan_orders
WHERE staff_id = '<SAMPLE_STAFF_UUID>'
  AND status = 'valid'
  AND scanned_at >= '<YYYY-MM-DD>'::date
  AND scanned_at < ('<YYYY-MM-DD>'::date + interval '1 month');

-- 3. Attendance
SELECT
  'Attendance' AS gate,
  count(*)::integer AS attendance_count,
  count(*) FILTER (WHERE status = 'hadir')::integer AS hadir
FROM public.raos_attendance
WHERE staff_id = '<SAMPLE_STAFF_UUID>'
  AND date >= '<YYYY-MM-DD>'::date
  AND date < ('<YYYY-MM-DD>'::date + interval '1 month');

-- 4. SOP + Driver Coaching + Koordinator Assessment (KPI snapshot)
SELECT
  'KPI Snapshot' AS gate,
  (kpi->>'score')::numeric AS kpi_score,
  (kpi->>'complete')::boolean AS kpi_complete,
  kpi
FROM public.raos_soeta_kpi_staff_snapshot('<SAMPLE_STAFF_UUID>', '<YYYY-MM-DD>'::date) AS kpi;

-- 5. Payroll canonical row
SELECT
  'Payroll' AS gate,
  gapok,
  bonus_saldo,
  bpjs,
  paket_data,
  member_parkir,
  bonus_kpi,
  target_pct,
  late_deduction_total,
  thp,
  status_target
FROM public.raos_payroll
WHERE staff_id = '<SAMPLE_STAFF_UUID>'
  AND effective_month = '<YYYY-MM-DD>'::date;

-- 6. No duplicate employee / profile
SELECT
  'Duplicates' AS gate,
  (SELECT count(*)::integer FROM public.raos_staff_master WHERE staff_id = '<SAMPLE_STAFF_UUID>') AS master_dup,
  (SELECT count(*)::integer FROM public.user_profiles WHERE id = (SELECT auth_user_id FROM public.raos_staff_master WHERE staff_id = '<SAMPLE_STAFF_UUID>')) AS profile_dup,
  (SELECT count(*)::integer FROM public.employees WHERE employee_id = '<SAMPLE_STAFF_UUID>') AS hris_dup;

-- 7. Branch / terminal scope
SELECT
  'Branch/Terminal' AS gate,
  s.airport,
  s.terminal,
  s.branch_id,
  b.name AS branch_name,
  b.code
FROM public.raos_staff_master s
LEFT JOIN public.branches b ON b.id = s.branch_id
WHERE s.staff_id = '<SAMPLE_STAFF_UUID>';
