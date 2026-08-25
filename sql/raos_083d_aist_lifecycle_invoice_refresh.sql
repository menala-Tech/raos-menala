-- ============================================================================
-- raos_083d: AIST lifecycle fix — refresh invoice validation on success
-- ============================================================================
-- Problem: aist_invoice_daily_validation is a daily snapshot. When a job that
-- was previously queued/timeout/failed later succeeds (manual recovery, SLA
-- retry, or device resync), the snapshot stays stale until the next daily
-- refresh cron runs. Finance/coordinator sees a mismatch that no longer exists.
--
-- Fix: AFTER UPDATE trigger on aist_jobs that refreshes the daily validation
-- for the matching branch and invoice date whenever a job reaches 'success'.
-- Idempotent: aist_refresh_invoice_daily uses ON CONFLICT DO UPDATE.
-- Does not mutate the six specific production rows; only refreshes the
-- validation summary after future state changes.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.aist_job_success_invoice_refresh_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_date date;
BEGIN
  IF NEW.status = 'success' AND (OLD.status IS DISTINCT FROM 'success') THEN
    SELECT (NEW.requested_at AT TIME ZONE COALESCE(NULLIF(b.timezone,''),'Asia/Jakarta'))::date
    INTO v_invoice_date
    FROM public.branches b
    WHERE b.id = NEW.branch_id;

    IF v_invoice_date IS NOT NULL THEN
      PERFORM public.aist_refresh_invoice_daily(NEW.branch_id, v_invoice_date);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.aist_job_success_invoice_refresh_trg() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_aist_job_success_invoice_refresh ON public.aist_jobs;
CREATE TRIGGER trg_aist_job_success_invoice_refresh
  AFTER UPDATE OF status ON public.aist_jobs
  FOR EACH ROW
  WHEN (NEW.status = 'success' AND OLD.status IS DISTINCT FROM 'success')
  EXECUTE FUNCTION public.aist_job_success_invoice_refresh_trg();
