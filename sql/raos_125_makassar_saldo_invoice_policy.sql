-- ============================================================================
-- raos_125: Makassar saldo net tiers + invoice display policy
-- ============================================================================
-- Scope: ONLY canonical Makassar branch code UPG.
-- New net saldo request tiers:
--   45.000, 95.000, 140.000, 190.000
-- Invoice display tiers:
--   50.000, 100.000, 150.000, 200.000
-- Legacy Makassar 145.000 / 195.000 remain display-compatible as
-- 150.000 / 200.000 in history, but are no longer selectable new net tiers.
-- Other branches are unchanged.
-- Raw raos_saldo_requests.nominal and aist_jobs.nominal remain the NET amount.
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

UPDATE public.branches
SET saldo_nominal_options = ARRAY[45000,95000,140000,190000]::integer[]
WHERE code = 'UPG' AND is_active = true;

CREATE OR REPLACE FUNCTION public.raos_saldo_invoice_nominal(
  p_branch_id uuid,
  p_nominal numeric
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = p_branch_id AND b.code = 'UPG'
    ) THEN CASE p_nominal
      WHEN 45000 THEN 50000
      WHEN 95000 THEN 100000
      WHEN 140000 THEN 150000
      WHEN 145000 THEN 150000
      WHEN 190000 THEN 200000
      WHEN 195000 THEN 200000
      ELSE p_nominal
    END
    ELSE p_nominal
  END;
$$;

REVOKE ALL ON FUNCTION public.raos_saldo_invoice_nominal(uuid,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.raos_saldo_invoice_nominal(uuid,numeric) TO authenticated, service_role;

COMMENT ON FUNCTION public.raos_saldo_invoice_nominal(uuid,numeric) IS
  'Read-only invoice display amount. UPG/Makassar rounds new 45/95/140/190k and legacy 145/195k net values to 50/100/150/200k invoice; other branches unchanged.';
