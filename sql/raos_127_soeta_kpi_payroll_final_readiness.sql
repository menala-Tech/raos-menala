-- ============================================================================
-- raos_127: SOETA KPI/Payroll data-input readiness
-- ============================================================================
-- Adds missing admin write paths for the canonical SOETA six-pillar KPI pipeline.
-- SECURITY DEFINER + branch/staff canonical scope.
-- UI pages may still need to be wired.
-- No synthetic production data.
-- ============================================================================

-- ---------- helper: is the branch a SOETA branch (hub or T1/T2/T3)? ----------
CREATE OR REPLACE FUNCTION public._is_soeta_branch(p_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.branches b
    LEFT JOIN public.branches hub ON hub.id = b.parent_branch_id
    WHERE b.id = p_branch_id
      AND (
        b.code = 'SOETA'
        OR hub.code = 'SOETA'
      )
  );
$$;

REVOKE ALL ON FUNCTION public._is_soeta_branch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._is_soeta_branch(uuid) TO service_role;

-- ---------- 1. Branch target upsert (SOETA scope, admin/direksi only) ----------
CREATE OR REPLACE FUNCTION public.raos_kpi_targets_branch_upsert(
  p_branch_id uuid,
  p_month date,
  p_mode text,
  p_target_cabang bigint,
  p_target_staff_default bigint DEFAULT NULL,
  p_target_gmv numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public.get_my_role();
  v_month date := date_trunc('month', p_month)::date;
  v_row public.raos_kpi_targets_branch%rowtype;
BEGIN
  IF auth.role() <> 'service_role'
     AND v_role <> ALL (ARRAY['admin','direksi']) THEN
    RAISE EXCEPTION 'forbidden: admin/direksi or service_role required';
  END IF;

  IF p_branch_id IS NULL OR p_month IS NULL OR p_mode IS NULL THEN
    RAISE EXCEPTION 'branch_id_month_mode_required';
  END IF;

  IF NOT public._is_soeta_branch(p_branch_id) THEN
    RAISE EXCEPTION 'branch_not_soeta';
  END IF;

  IF p_mode NOT IN ('saldo','order') THEN
    RAISE EXCEPTION 'invalid_mode: %', p_mode;
  END IF;

  IF p_target_cabang < 0 THEN
    RAISE EXCEPTION 'target_cabang_must_be_non_negative';
  END IF;

  INSERT INTO public.raos_kpi_targets_branch (
    branch_id, effective_month, mode, target_cabang, target_staff_default, target_gmv, created_by
  ) VALUES (
    p_branch_id, v_month, p_mode, p_target_cabang, p_target_staff_default, p_target_gmv, auth.uid()
  )
  ON CONFLICT (branch_id, effective_month) DO UPDATE SET
    mode = EXCLUDED.mode,
    target_cabang = EXCLUDED.target_cabang,
    target_staff_default = EXCLUDED.target_staff_default,
    target_gmv = EXCLUDED.target_gmv,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'branch_id', v_row.branch_id,
    'effective_month', v_row.effective_month,
    'mode', v_row.mode,
    'target_cabang', v_row.target_cabang,
    'target_staff_default', v_row.target_staff_default,
    'target_gmv', v_row.target_gmv
  );
END;
$$;

REVOKE ALL ON FUNCTION public.raos_kpi_targets_branch_upsert(uuid,date,text,bigint,bigint,numeric)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.raos_kpi_targets_branch_upsert(uuid,date,text,bigint,bigint,numeric)
TO authenticated, service_role;

-- ---------- 2. Staff target upsert (canonical SOETA linked staff only) ----------
CREATE OR REPLACE FUNCTION public.raos_kpi_targets_staff_upsert(
  p_staff_id uuid,
  p_month date,
  p_target_order bigint DEFAULT NULL,
  p_target_gmv numeric DEFAULT NULL,
  p_member_parkir_amount int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public.get_my_role();
  v_month date := date_trunc('month', p_month)::date;
  v_row public.raos_kpi_targets_staff%rowtype;
  v_branch_id uuid;
  v_target_branch uuid;
BEGIN
  IF auth.role() <> 'service_role'
     AND v_role <> ALL (ARRAY['admin','direksi']) THEN
    RAISE EXCEPTION 'forbidden: admin/direksi or service_role required';
  END IF;

  IF p_staff_id IS NULL OR p_month IS NULL THEN
    RAISE EXCEPTION 'staff_id_and_month_required';
  END IF;

  IF p_target_order IS NOT NULL AND p_target_order < 0 THEN
    RAISE EXCEPTION 'target_order_must_be_non_negative';
  END IF;

  IF p_target_gmv IS NOT NULL AND p_target_gmv < 0 THEN
    RAISE EXCEPTION 'target_gmv_must_be_non_negative';
  END IF;

  SELECT up.branch_id, COALESCE(b.parent_branch_id, b.id)
  INTO v_branch_id, v_target_branch
  FROM public.user_profiles up
  JOIN public.branches b ON b.id = up.branch_id
  WHERE up.id = p_staff_id
    AND up.is_active = true;

  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'active_staff_not_found';
  END IF;

  IF NOT public._is_soeta_branch(v_branch_id) THEN
    RAISE EXCEPTION 'staff_not_in_soeta';
  END IF;

  -- Canonical SOETA staff membership from SSOT mirror.
  IF NOT EXISTS (
    SELECT 1
    FROM public.raos_staff_master m
    JOIN public.raos_soeta_staff_sheet_mirror sm ON sm.staff_id = m.staff_id
    WHERE m.auth_user_id = p_staff_id
  ) THEN
    RAISE EXCEPTION 'staff_not_canonical_soeta';
  END IF;

  INSERT INTO public.raos_kpi_targets_staff (
    staff_id, effective_month, target_order, target_gmv, member_parkir_amount
  ) VALUES (
    p_staff_id, v_month, p_target_order, p_target_gmv, COALESCE(p_member_parkir_amount, 0)
  )
  ON CONFLICT (staff_id, effective_month) DO UPDATE SET
    target_order = EXCLUDED.target_order,
    target_gmv = EXCLUDED.target_gmv,
    member_parkir_amount = EXCLUDED.member_parkir_amount,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'staff_id', v_row.staff_id,
    'effective_month', v_row.effective_month,
    'target_order', v_row.target_order,
    'target_gmv', v_row.target_gmv,
    'member_parkir_amount', v_row.member_parkir_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.raos_kpi_targets_staff_upsert(uuid,date,bigint,numeric,int)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.raos_kpi_targets_staff_upsert(uuid,date,bigint,numeric,int)
TO authenticated, service_role;

-- ---------- 3. Manual KPI inputs upsert (SOETA canonical staff only) ----------
CREATE OR REPLACE FUNCTION public.raos_soeta_kpi_manual_inputs_upsert(
  p_staff_id uuid,
  p_month date,
  p_sop_score numeric DEFAULT NULL,
  p_coaching_score numeric DEFAULT NULL,
  p_coordinator_score numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public.get_my_role();
  v_month date := date_trunc('month', p_month)::date;
  v_row public.raos_soeta_kpi_manual_inputs%rowtype;
  v_branch_id uuid;
BEGIN
  IF auth.role() <> 'service_role'
     AND v_role <> ALL (ARRAY['admin','direksi']) THEN
    RAISE EXCEPTION 'forbidden: admin/direksi or service_role required';
  END IF;

  IF p_staff_id IS NULL OR p_month IS NULL THEN
    RAISE EXCEPTION 'staff_id_and_month_required';
  END IF;

  IF p_sop_score IS NOT NULL AND (p_sop_score < 0 OR p_sop_score > 100) THEN
    RAISE EXCEPTION 'sop_score_out_of_range';
  END IF;

  IF p_coaching_score IS NOT NULL AND (p_coaching_score < 0 OR p_coaching_score > 100) THEN
    RAISE EXCEPTION 'coaching_score_out_of_range';
  END IF;

  IF p_coordinator_score IS NOT NULL AND (p_coordinator_score < 0 OR p_coordinator_score > 100) THEN
    RAISE EXCEPTION 'coordinator_score_out_of_range';
  END IF;

  SELECT up.branch_id INTO v_branch_id
  FROM public.user_profiles up
  WHERE up.id = p_staff_id
    AND up.is_active = true;

  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'active_staff_not_found';
  END IF;

  IF NOT public._is_soeta_branch(v_branch_id) THEN
    RAISE EXCEPTION 'staff_not_in_soeta';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.raos_staff_master m
    JOIN public.raos_soeta_staff_sheet_mirror sm ON sm.staff_id = m.staff_id
    WHERE m.auth_user_id = p_staff_id
  ) THEN
    RAISE EXCEPTION 'staff_not_canonical_soeta';
  END IF;

  INSERT INTO public.raos_soeta_kpi_manual_inputs (
    staff_id, effective_month, sop_score, coaching_score, coordinator_score, notes, updated_by
  ) VALUES (
    p_staff_id, v_month, p_sop_score, p_coaching_score, p_coordinator_score, p_notes, auth.uid()
  )
  ON CONFLICT (staff_id, effective_month) DO UPDATE SET
    sop_score = EXCLUDED.sop_score,
    coaching_score = EXCLUDED.coaching_score,
    coordinator_score = EXCLUDED.coordinator_score,
    notes = EXCLUDED.notes,
    updated_by = auth.uid(),
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'staff_id', v_row.staff_id,
    'effective_month', v_row.effective_month,
    'sop_score', v_row.sop_score,
    'coaching_score', v_row.coaching_score,
    'coordinator_score', v_row.coordinator_score,
    'notes', v_row.notes,
    'updated_by', v_row.updated_by
  );
END;
$$;

REVOKE ALL ON FUNCTION public.raos_soeta_kpi_manual_inputs_upsert(uuid,date,numeric,numeric,numeric,text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.raos_soeta_kpi_manual_inputs_upsert(uuid,date,numeric,numeric,numeric,text)
TO authenticated, service_role;

-- ---------- 4. Canonical SOETA linked staff list (for admin UI) ----------
CREATE OR REPLACE FUNCTION public.raos_soeta_canonical_staff_list(
  p_month date DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid,
  staff_id text,
  full_name text,
  role text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public.get_my_role();
BEGIN
  IF auth.role() <> 'service_role'
     AND v_role <> ALL (ARRAY['admin','direksi','management']) THEN
    RAISE EXCEPTION 'forbidden: admin/management/direksi or service_role required';
  END IF;

  RETURN QUERY
  SELECT
    up.id AS user_id,
    m.staff_id,
    up.full_name,
    up.role
  FROM public.raos_staff_master m
  JOIN public.raos_soeta_staff_sheet_mirror sm ON sm.staff_id = m.staff_id
  JOIN public.user_profiles up ON up.id = m.auth_user_id
  WHERE m.is_activated = true
    AND m.auth_user_id IS NOT NULL
    AND up.is_active = true
  ORDER BY sm.staff_id;
END;
$$;

REVOKE ALL ON FUNCTION public.raos_soeta_canonical_staff_list(date)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.raos_soeta_canonical_staff_list(date)
TO authenticated, service_role;

COMMENT ON FUNCTION public.raos_soeta_canonical_staff_list(date) IS
'Returns the canonical 43 linked/activated SOETA staff for the KPI admin UI.';
