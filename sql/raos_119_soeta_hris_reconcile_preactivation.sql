-- ============================================================================
-- raos_119: Reconcile existing SOETA HRIS employees into RAOS pre-activation
-- ============================================================================
-- Safety rules:
--   * Existing public.employees rows are NEVER inserted/updated/deleted here.
--   * Exact identity key is employees.employee_id -> raos_staff_master.staff_id.
--   * Existing staff_master rows are NEVER overwritten (ON CONFLICT DO NOTHING).
--   * New rows remain pre-activation: terminal/branch/auth are not assigned.
--   * p_apply defaults false. Dry-run returns counts only.
-- ============================================================================

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
  v_candidates integer := 0;
  v_existing integer := 0;
  v_insertable integer := 0;
  v_inserted integer := 0;
BEGIN
  IF auth.role() <> 'service_role'
     AND v_role <> ALL (ARRAY['admin','management','direksi']) THEN
    RAISE EXCEPTION 'forbidden: admin/management/direksi or service_role required';
  END IF;

  SELECT count(*)::integer
  INTO v_candidates
  FROM public.employees e
  WHERE NULLIF(btrim(e.employee_id),'') IS NOT NULL
    AND COALESCE(e.branch,'') ILIKE '%SOETA%';

  SELECT count(*)::integer
  INTO v_existing
  FROM public.employees e
  JOIN public.raos_staff_master m
    ON upper(btrim(m.staff_id)) = upper(btrim(e.employee_id))
  WHERE NULLIF(btrim(e.employee_id),'') IS NOT NULL
    AND COALESCE(e.branch,'') ILIKE '%SOETA%';

  v_insertable := greatest(v_candidates - v_existing, 0);

  IF NOT p_apply THEN
    RETURN jsonb_build_object(
      'ok', true,
      'apply', false,
      'candidate_count', v_candidates,
      'existing_master_count', v_existing,
      'insertable_count', v_insertable,
      'inserted_count', 0
    );
  END IF;

  INSERT INTO public.raos_staff_master (
    staff_id,
    full_name,
    email,
    phone,
    role,
    airport,
    terminal,
    status,
    is_activated,
    auth_user_id,
    source
  )
  SELECT
    btrim(e.employee_id),
    COALESCE(NULLIF(btrim(e.full_name),''), btrim(e.employee_id)),
    NULLIF(btrim(e.email),''),
    NULLIF(btrim(e.phone),''),
    CASE
      WHEN lower(COALESCE(e.position,'')) LIKE '%koordinator%' THEN 'koordinator'
      WHEN lower(COALESCE(e.position,'')) LIKE '%management%' THEN 'management'
      ELSE 'staff'
    END,
    'SOETA',
    NULL,
    CASE upper(COALESCE(e.status,''))
      WHEN 'AKTIF' THEN 'Aktif'
      WHEN 'NONAKTIF' THEN 'Nonaktif'
      ELSE 'Pending'
    END,
    false,
    NULL,
    'hris_reconcile:employees_soeta_preactivation'
  FROM public.employees e
  WHERE NULLIF(btrim(e.employee_id),'') IS NOT NULL
    AND COALESCE(e.branch,'') ILIKE '%SOETA%'
  ON CONFLICT (staff_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'apply', true,
    'candidate_count', v_candidates,
    'existing_master_count', v_existing,
    'insertable_count', v_insertable,
    'inserted_count', v_inserted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.raos_soeta_reconcile_hris_preactivation(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.raos_soeta_reconcile_hris_preactivation(boolean) TO service_role;

COMMENT ON FUNCTION public.raos_soeta_reconcile_hris_preactivation(boolean) IS
  'Fail-safe reconciliation of existing SOETA HRIS employees into RAOS staff master as non-activated pre-activation records. Dry-run by default; service_role execute only.';
