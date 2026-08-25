-- ============================================================================
-- raos_125: Makassar net tiers + global saldo invoice rounding
-- ============================================================================
-- Net saldo request tiers:
--   Makassar/UPG ONLY -> 45.000, 95.000, 140.000, 190.000
--   Other branches -> unchanged from their current saldo_nominal_options.
-- Invoice display tiers for ALL branches:
--   45.000 -> 50.000
--   95.000 -> 100.000
--   140.000/145.000 -> 150.000
--   190.000/195.000 -> 200.000
-- Raw raos_saldo_requests.nominal and aist_jobs.nominal remain NET amounts.
-- ============================================================================

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.branches
  WHERE code = 'UPG' AND is_active = true;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Makassar branch preflight failed: expected exactly one active UPG branch, got %', v_count;
  END IF;
END $$;

-- ONLY Makassar transaction choices change.
UPDATE public.branches
SET saldo_nominal_options = '[45000,95000,140000,190000]'::jsonb
WHERE code = 'UPG' AND is_active = true;

-- Invoice presentation policy applies to every branch.
CREATE OR REPLACE FUNCTION public.raos_saldo_invoice_nominal(
  p_branch_id uuid,
  p_nominal numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_nominal
    WHEN 45000 THEN 50000
    WHEN 95000 THEN 100000
    WHEN 140000 THEN 150000
    WHEN 145000 THEN 150000
    WHEN 190000 THEN 200000
    WHEN 195000 THEN 200000
    ELSE p_nominal
  END;
$$;

REVOKE ALL ON FUNCTION public.raos_saldo_invoice_nominal(uuid,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.raos_saldo_invoice_nominal(uuid,numeric) TO authenticated, service_role;

COMMENT ON FUNCTION public.raos_saldo_invoice_nominal(uuid,numeric) IS
  'Read-only invoice display amount for all branches: 45/95/140|145/190|195k -> 50/100/150/200k. Raw transaction nominal remains unchanged.';

-- Daily invoice totals use rounded invoice display values for ALL branches,
-- while AIST mismatch validation continues comparing the raw transaction values.
CREATE OR REPLACE FUNCTION public.aist_refresh_invoice_daily(p_branch_id uuid,p_date date)
RETURNS public.aist_invoice_daily_validation
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE v_row public.aist_invoice_daily_validation;
BEGIN
  INSERT INTO public.aist_invoice_daily_validation(branch_id,invoice_date,total_transactions,total_nominal,aist_valid_count,mismatch_count,generated_at,updated_at)
  SELECT p_branch_id,p_date,count(*)::integer,
    COALESCE(sum(public.raos_saldo_invoice_nominal(r.branch_id,r.nominal)),0)::numeric(18,2),
    count(*) FILTER(WHERE j.status='success')::integer,
    count(*) FILTER(WHERE j.id IS NULL OR j.status<>'success' OR j.driver_login_id IS DISTINCT FROM r.driver_login_id
      OR j.nominal IS DISTINCT FROM r.nominal OR j.branch_id IS DISTINCT FROM r.branch_id)::integer,now(),now()
  FROM public.raos_saldo_requests r
  JOIN public.branches b ON b.id=r.branch_id
  LEFT JOIN public.aist_jobs j ON j.request_id=r.id
  WHERE r.branch_id=p_branch_id
    AND (r.requested_at AT TIME ZONE COALESCE(NULLIF(b.timezone,''),'Asia/Jakarta'))::date=p_date
    AND r.is_processed=true
  ON CONFLICT(branch_id,invoice_date) DO UPDATE SET total_transactions=EXCLUDED.total_transactions,total_nominal=EXCLUDED.total_nominal,
    aist_valid_count=EXCLUDED.aist_valid_count,mismatch_count=EXCLUDED.mismatch_count,generated_at=now(),updated_at=now()
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

-- Recalculate existing invoice-history totals for ALL branches using the
-- rounded invoice presentation policy. No raw saldo request is modified.
UPDATE public.aist_invoice_daily_validation v
SET total_nominal = COALESCE((
      SELECT sum(public.raos_saldo_invoice_nominal(r.branch_id,r.nominal))
      FROM public.raos_saldo_requests r
      JOIN public.branches b ON b.id=r.branch_id
      WHERE r.branch_id=v.branch_id
        AND (r.requested_at AT TIME ZONE COALESCE(NULLIF(b.timezone,''),'Asia/Jakarta'))::date=v.invoice_date
        AND r.is_processed=true
    ),0),
    updated_at = now();
