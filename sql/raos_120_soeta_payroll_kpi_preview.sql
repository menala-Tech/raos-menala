-- ============================================================================
-- raos_120: SOETA payroll KPI preview contract
-- ============================================================================
-- READ-ONLY. Does not update raos_payroll.
-- Purpose: validate how the six-pillar KPI score would replace the legacy
-- driver-active basis for bonus_kpi on SOETA while preserving legacy branches.
--
-- Proposed money tier intentionally preserves the existing bonus_kpi amounts:
--   score < 80    -> 0
--   score 80-89.99 -> 180,000
--   score 90-99.99 -> 240,000
--   score >= 100   -> 300,000
-- A snapshot with incomplete required inputs is never payroll-ready.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.raos_soeta_payroll_kpi_preview(
  p_staff_id uuid,
  p_month date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public.get_my_role();
  v_month date := date_trunc('month', p_month)::date;
  v_kpi jsonb;
  v_score numeric := 0;
  v_complete boolean := false;
  v_bonus integer := 0;
  v_payroll public.raos_payroll%rowtype;
BEGIN
  IF p_staff_id IS NULL OR p_month IS NULL THEN
    RAISE EXCEPTION 'staff_id_and_month_required';
  END IF;

  IF auth.role() <> 'service_role'
     AND auth.uid() IS DISTINCT FROM p_staff_id
     AND v_role <> ALL (ARRAY['admin','management','direksi','koordinator']) THEN
    RAISE EXCEPTION 'role_not_allowed';
  END IF;

  v_kpi := public.raos_soeta_kpi_staff_snapshot(p_staff_id, v_month);
  v_score := COALESCE((v_kpi->>'score')::numeric, 0);
  v_complete := COALESCE((v_kpi->>'complete')::boolean, false);

  IF v_complete THEN
    v_bonus := CASE
      WHEN v_score >= 100 THEN 300000
      WHEN v_score >= 90 THEN 240000
      WHEN v_score >= 80 THEN 180000
      ELSE 0
    END;
  END IF;

  SELECT * INTO v_payroll
  FROM public.raos_payroll
  WHERE staff_id = p_staff_id
    AND effective_month = v_month
  LIMIT 1;

  RETURN jsonb_build_object(
    'staffId', p_staff_id,
    'effectiveMonth', v_month,
    'payrollReady', v_complete,
    'kpiScore', v_score,
    'proposedBonusKpi', v_bonus,
    'currentPayroll', CASE WHEN v_payroll.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_payroll.id,
      'gapok', v_payroll.gapok,
      'bonusSaldo', v_payroll.bonus_saldo,
      'bonusKpi', v_payroll.bonus_kpi,
      'bpjs', v_payroll.bpjs,
      'paketData', v_payroll.paket_data,
      'memberParkir', v_payroll.member_parkir,
      'lateDeductionTotal', v_payroll.late_deduction_total,
      'thp', v_payroll.thp,
      'statusTarget', v_payroll.status_target
    ) END,
    'bonusKpiDelta', v_bonus - COALESCE(v_payroll.bonus_kpi,0),
    'kpi', v_kpi
  );
END;
$$;

REVOKE ALL ON FUNCTION public.raos_soeta_payroll_kpi_preview(uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.raos_soeta_payroll_kpi_preview(uuid,date) TO authenticated, service_role;

COMMENT ON FUNCTION public.raos_soeta_payroll_kpi_preview(uuid,date) IS
  'Read-only SOETA payroll preview using six-pillar KPI. No payroll mutation; used for Preview QA before cutover.';
