-- ============================================================================
-- raos_122: SOETA KPI / reconciliation role-scope hardening
-- ============================================================================
-- Keeps v118/v119 behavior but restores role boundaries:
--   * staff: own KPI only
--   * koordinator: KPI read only within branch scope
--   * management: global read only
--   * admin/direksi: KPI write + reconciliation apply
--   * service_role: internal execution
-- ============================================================================

-- 1) Manual KPI table: scoped read, Admin/Direksi write only.
DROP POLICY IF EXISTS raos_soeta_kpi_manual_select ON public.raos_soeta_kpi_manual_inputs;
CREATE POLICY raos_soeta_kpi_manual_select
  ON public.raos_soeta_kpi_manual_inputs
  FOR SELECT
  TO authenticated
  USING (
    staff_id = (SELECT auth.uid())
    OR public.get_my_role() = ANY (ARRAY['admin','management','direksi'])
    OR (
      public.get_my_role() = 'koordinator'
      AND EXISTS (
        SELECT 1
        FROM public.user_profiles target_up
        WHERE target_up.id = raos_soeta_kpi_manual_inputs.staff_id
          AND public.is_branch_in_scope(target_up.branch_id)
      )
    )
  );

DROP POLICY IF EXISTS raos_soeta_kpi_manual_write ON public.raos_soeta_kpi_manual_inputs;
CREATE POLICY raos_soeta_kpi_manual_write
  ON public.raos_soeta_kpi_manual_inputs
  FOR ALL
  TO authenticated
  USING (public.get_my_role() = ANY (ARRAY['admin','direksi']))
  WITH CHECK (public.get_my_role() = ANY (ARRAY['admin','direksi']));

-- 2) Preserve the v118 implementation behind a non-public internal function,
--    then expose a scope-checking wrapper with the canonical signature.
ALTER FUNCTION public.raos_soeta_kpi_staff_snapshot(uuid,date)
  RENAME TO raos_soeta_kpi_staff_snapshot_v118_internal;

REVOKE ALL ON FUNCTION public.raos_soeta_kpi_staff_snapshot_v118_internal(uuid,date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.raos_soeta_kpi_staff_snapshot_v118_internal(uuid,date)
  TO service_role;

CREATE OR REPLACE FUNCTION public.raos_soeta_kpi_staff_snapshot(
  p_staff_id uuid,
  p_month date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_role text := public.get_my_role();
  v_target_branch uuid;
BEGIN
  IF p_staff_id IS NULL OR p_month IS NULL THEN
    RAISE EXCEPTION 'staff_id_and_month_required';
  END IF;

  IF auth.role() = 'service_role' THEN
    RETURN public.raos_soeta_kpi_staff_snapshot_v118_internal(p_staff_id, p_month);
  END IF;

  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF v_caller = p_staff_id THEN
    RETURN public.raos_soeta_kpi_staff_snapshot_v118_internal(p_staff_id, p_month);
  END IF;

  IF v_role = ANY (ARRAY['admin','management','direksi']) THEN
    RETURN public.raos_soeta_kpi_staff_snapshot_v118_internal(p_staff_id, p_month);
  END IF;

  IF v_role = 'koordinator' THEN
    SELECT branch_id INTO v_target_branch
    FROM public.user_profiles
    WHERE id = p_staff_id AND is_active = true;

    IF v_target_branch IS NULL OR NOT public.is_branch_in_scope(v_target_branch) THEN
      RAISE EXCEPTION 'branch_out_of_scope';
    END IF;

    RETURN public.raos_soeta_kpi_staff_snapshot_v118_internal(p_staff_id, p_month);
  END IF;

  RAISE EXCEPTION 'role_not_allowed';
END;
$$;

REVOKE ALL ON FUNCTION public.raos_soeta_kpi_staff_snapshot(uuid,date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.raos_soeta_kpi_staff_snapshot(uuid,date)
  TO authenticated, service_role;

-- 3) Reconciliation: preserve v119 implementation internally and expose a
--    write gate that excludes Management from apply-capable execution.
ALTER FUNCTION public.raos_soeta_reconcile_hris_preactivation(boolean)
  RENAME TO raos_soeta_reconcile_hris_preactivation_v119_internal;

REVOKE ALL ON FUNCTION public.raos_soeta_reconcile_hris_preactivation_v119_internal(boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.raos_soeta_reconcile_hris_preactivation_v119_internal(boolean)
  TO service_role;

CREATE OR REPLACE FUNCTION public.raos_soeta_reconcile_hris_preactivation(
  p_apply boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public.get_my_role();
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN public.raos_soeta_reconcile_hris_preactivation_v119_internal(p_apply);
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF v_role <> ALL (ARRAY['admin','direksi']) THEN
    RAISE EXCEPTION 'forbidden: admin/direksi or service_role required';
  END IF;

  RETURN public.raos_soeta_reconcile_hris_preactivation_v119_internal(p_apply);
END;
$$;

REVOKE ALL ON FUNCTION public.raos_soeta_reconcile_hris_preactivation(boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.raos_soeta_reconcile_hris_preactivation(boolean)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.raos_soeta_kpi_staff_snapshot(uuid,date) IS
  'SOETA six-pillar KPI snapshot with staff-own, koordinator branch-scoped, management read-only and admin/direksi access.';
COMMENT ON FUNCTION public.raos_soeta_reconcile_hris_preactivation(boolean) IS
  'SOETA HRIS preactivation reconciliation; apply execution restricted to admin/direksi/service_role.';
