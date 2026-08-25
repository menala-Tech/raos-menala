-- ============================================================================
-- raos_123: SOETA payroll KPI cutover contract
-- ============================================================================
-- Controlled mutation layer for replacing ONLY raos_payroll.bonus_kpi on SOETA
-- with the validated six-pillar KPI tier from raos_120 preview.
--
-- Safety:
--   * dry-run by default (p_apply=false)
--   * Admin/Direksi/service_role only
--   * requires an existing canonical raos_payroll row
--   * requires KPI snapshot complete/payrollReady
--   * updates bonus_kpi + audit fields only
--   * does NOT change gapok, bonus_saldo, BPJS, paket data, member parkir,
--     attendance deductions, target_pct, status_target, driver_active_pct or THP
-- ============================================================================

CREATE OR REPLACE FUNCTION public.raos_soeta_payroll_kpi_cutover(
  p_staff_id uuid,
  p_month date,
  p_apply boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public.get_my_role();
  v_month date := date_trunc('month', p_month)::date;
  v_preview jsonb;
  v_ready boolean := false;
  v_proposed integer := 0;
  v_before public.raos_payroll%rowtype;
  v_after public.raos_payroll%rowtype;
BEGIN
  IF p_staff_id IS NULL OR p_month IS NULL THEN
    RAISE EXCEPTION 'staff_id_and_month_required';
  END IF;

  IF auth.role() <> 'service_role'
     AND v_role <> ALL (ARRAY['admin','direksi']) THEN
    RAISE EXCEPTION 'forbidden: admin/direksi or service_role required';
  END IF;

  v_preview := public.raos_soeta_payroll_kpi_preview(p_staff_id, v_month);
  v_ready := COALESCE((v_preview->>'payrollReady')::boolean, false);
  v_proposed := COALESCE((v_preview->>'proposedBonusKpi')::integer, 0);

  IF NOT v_ready THEN
    RAISE EXCEPTION 'kpi_not_payroll_ready';
  END IF;

  SELECT * INTO v_before
  FROM public.raos_payroll
  WHERE staff_id = p_staff_id
    AND effective_month = v_month
  LIMIT 1;

  IF v_before.id IS NULL THEN
    RAISE EXCEPTION 'payroll_row_missing_run_canonical_compute_first';
  END IF;

  IF NOT p_apply THEN
    RETURN jsonb_build_object(
      'ok', true,
      'apply', false,
      'staffId', p_staff_id,
      'effectiveMonth', v_month,
      'payrollReady', true,
      'currentBonusKpi', v_before.bonus_kpi,
      'proposedBonusKpi', v_proposed,
      'bonusKpiDelta', v_proposed - COALESCE(v_before.bonus_kpi,0),
      'wouldChange', COALESCE(v_before.bonus_kpi,0) IS DISTINCT FROM v_proposed,
      'preview', v_preview
    );
  END IF;

  SELECT * INTO v_before
  FROM public.raos_payroll
  WHERE staff_id = p_staff_id
    AND effective_month = v_month
  FOR UPDATE;

  UPDATE public.raos_payroll
  SET bonus_kpi = v_proposed,
      computed_at = now(),
      computed_by = COALESCE(auth.uid(), computed_by)
  WHERE id = v_before.id
  RETURNING * INTO v_after;

  RETURN jsonb_build_object(
    'ok', true,
    'apply', true,
    'staffId', p_staff_id,
    'effectiveMonth', v_month,
    'payrollReady', true,
    'beforeBonusKpi', v_before.bonus_kpi,
    'afterBonusKpi', v_after.bonus_kpi,
    'bonusKpiDelta', v_after.bonus_kpi - COALESCE(v_before.bonus_kpi,0),
    'preserved', jsonb_build_object(
      'gapok', v_after.gapok,
      'bonusSaldo', v_after.bonus_saldo,
      'bpjs', v_after.bpjs,
      'paketData', v_after.paket_data,
      'memberParkir', v_after.member_parkir,
      'lateDeductionTotal', v_after.late_deduction_total,
      'targetPct', v_after.target_pct,
      'driverActivePct', v_after.driver_active_pct,
      'statusTarget', v_after.status_target,
      'thp', v_after.thp
    ),
    'preview', v_preview
  );
END;
$$;

REVOKE ALL ON FUNCTION public.raos_soeta_payroll_kpi_cutover(uuid,date,boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.raos_soeta_payroll_kpi_cutover(uuid,date,boolean)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.raos_soeta_payroll_kpi_cutover(uuid,date,boolean) IS
  'Gated SOETA payroll cutover. Dry-run default; writes only bonus_kpi on an existing canonical payroll row after complete six-pillar KPI validation.';
