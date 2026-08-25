-- ============================================================================
-- raos_aist_mismatch_audit: classify AIST invoice mismatches per branch/date
-- ============================================================================
-- Run as admin/service_role. Read-only.
-- Replace <BRANCH_UUID> and <YYYY-MM-DD> in the params CTE.
-- ============================================================================

WITH params AS (
  SELECT
    '<BRANCH_UUID>'::uuid AS v_branch_id,
    '<YYYY-MM-DD>'::date AS v_date
)
SELECT
  r.id AS request_id,
  r.driver_login_id AS request_driver_login_id,
  j.driver_login_id AS aist_driver_login_id,
  r.nominal AS request_nominal,
  j.nominal AS aist_nominal,
  r.branch_id AS request_branch_id,
  j.branch_id AS aist_branch_id,
  j.id AS aist_job_id,
  j.status AS aist_job_status,
  j.error_code,
  j.error_message,
  j.aist_reference,
  CASE
    WHEN j.id IS NULL THEN 'no_aist_job'
    WHEN j.status <> 'success' THEN 'job_not_success:' || j.status
    WHEN j.driver_login_id IS DISTINCT FROM r.driver_login_id THEN 'driver_login_mismatch'
    WHEN j.nominal IS DISTINCT FROM r.nominal THEN 'nominal_mismatch'
    WHEN j.branch_id IS DISTINCT FROM r.branch_id THEN 'branch_mismatch'
    ELSE 'legacy_or_stale_snapshot'
  END AS mismatch_category,
  CASE
    WHEN j.id IS NULL THEN 'AIST never picked this processed request; trigger may have missed or device not ready'
    WHEN j.status = 'queued' THEN 'Waiting for AIST agent to claim'
    WHEN j.status = 'claimed' THEN 'AIST agent claimed but has not reported running/verifying'
    WHEN j.status = 'running' THEN 'AIST processing in progress'
    WHEN j.status = 'verifying' THEN 'AIST verifying result'
    WHEN j.status = 'failed' THEN 'AIST finished with failure: ' || COALESCE(j.error_message,'unknown')
    WHEN j.status = 'timeout' THEN 'AIST SLA 120s timeout; needs manual request or recovery'
    WHEN j.status = 'cancelled' THEN 'AIST job cancelled'
    WHEN j.status <> 'success' THEN 'AIST job not successful (' || j.status || ')'
    WHEN j.driver_login_id IS DISTINCT FROM r.driver_login_id THEN 'Driver login mismatch between SSOT and AIST'
    WHEN j.nominal IS DISTINCT FROM r.nominal THEN 'Nominal mismatch between request and AIST result'
    WHEN j.branch_id IS DISTINCT FROM r.branch_id THEN 'Branch mismatch between request and AIST job'
    ELSE 'Stale snapshot or transient validation'
  END AS operational_note
FROM public.raos_saldo_requests r
CROSS JOIN params p
LEFT JOIN public.aist_jobs j ON j.request_id = r.id
WHERE r.branch_id = p.v_branch_id
  AND r.is_processed = true
  AND (r.requested_at AT TIME ZONE COALESCE(NULLIF((SELECT timezone FROM public.branches WHERE id = r.branch_id),'')::text,'Asia/Jakarta'))::date = p.v_date
  AND (
    j.id IS NULL
    OR j.status <> 'success'
    OR j.driver_login_id IS DISTINCT FROM r.driver_login_id
    OR j.nominal IS DISTINCT FROM r.nominal
    OR j.branch_id IS DISTINCT FROM r.branch_id
  )
ORDER BY r.requested_at;
