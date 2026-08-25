-- ============================================================================
-- raos_118: SOETA six-pillar KPI foundation
-- ============================================================================
-- Additive only. Does not replace legacy saldo/order payroll logic yet.
-- KPI policy for SOETA:
--   Target Order          40%
--   GMV / Nilai Order    20%
--   Kehadiran            15%
--   SOP                   10%
--   Pembinaan Driver     10%
--   Penilaian Koordinator 5%
--
-- Goal: provide one canonical score contract that can be validated in Preview
-- before payroll/Finance consume it. Manual pillars stay admin-managed; order,
-- GMV and attendance are derived from canonical RAOS operational tables.
-- ============================================================================

-- ---------- 1. Extend existing target SSOT for GMV -------------------------
ALTER TABLE public.raos_kpi_targets_branch
  ADD COLUMN IF NOT EXISTS target_gmv numeric(18,2);

ALTER TABLE public.raos_kpi_targets_staff
  ADD COLUMN IF NOT EXISTS target_gmv numeric(18,2);

COMMENT ON COLUMN public.raos_kpi_targets_branch.target_gmv IS
  'Optional monthly GMV target for order-mode branches such as SOETA.';
COMMENT ON COLUMN public.raos_kpi_targets_staff.target_gmv IS
  'Optional monthly GMV override per staff. Falls back to equal share of branch GMV target.';

-- ---------- 2. Manual KPI pillars ------------------------------------------
CREATE TABLE IF NOT EXISTS public.raos_soeta_kpi_manual_inputs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id              uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  effective_month       date NOT NULL,
  sop_score             numeric(5,2),
  coaching_score        numeric(5,2),
  coordinator_score     numeric(5,2),
  notes                  text,
  updated_by             uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT raos_soeta_kpi_manual_month_start_chk
    CHECK (effective_month = date_trunc('month', effective_month)::date),
  CONSTRAINT raos_soeta_kpi_manual_sop_chk
    CHECK (sop_score IS NULL OR (sop_score >= 0 AND sop_score <= 100)),
  CONSTRAINT raos_soeta_kpi_manual_coaching_chk
    CHECK (coaching_score IS NULL OR (coaching_score >= 0 AND coaching_score <= 100)),
  CONSTRAINT raos_soeta_kpi_manual_coord_chk
    CHECK (coordinator_score IS NULL OR (coordinator_score >= 0 AND coordinator_score <= 100)),
  UNIQUE (staff_id, effective_month)
);

CREATE INDEX IF NOT EXISTS raos_soeta_kpi_manual_month_idx
  ON public.raos_soeta_kpi_manual_inputs (effective_month, staff_id);

ALTER TABLE public.raos_soeta_kpi_manual_inputs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS raos_soeta_kpi_manual_select ON public.raos_soeta_kpi_manual_inputs;
CREATE POLICY raos_soeta_kpi_manual_select
  ON public.raos_soeta_kpi_manual_inputs
  FOR SELECT
  TO authenticated
  USING (
    staff_id = (SELECT auth.uid())
    OR public.get_my_role() = ANY (ARRAY['admin','management','direksi','koordinator'])
  );

DROP POLICY IF EXISTS raos_soeta_kpi_manual_write ON public.raos_soeta_kpi_manual_inputs;
CREATE POLICY raos_soeta_kpi_manual_write
  ON public.raos_soeta_kpi_manual_inputs
  FOR ALL
  TO authenticated
  USING (public.get_my_role() = ANY (ARRAY['admin','management','direksi']))
  WITH CHECK (public.get_my_role() = ANY (ARRAY['admin','management','direksi']));

REVOKE ALL ON public.raos_soeta_kpi_manual_inputs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.raos_soeta_kpi_manual_inputs TO authenticated;
GRANT ALL ON public.raos_soeta_kpi_manual_inputs TO service_role;

-- ---------- 3. Canonical six-pillar snapshot -------------------------------
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
  v_caller_role text := public.get_my_role();
  v_month date := date_trunc('month', p_month)::date;
  v_staff record;
  v_branch record;
  v_target_branch_id uuid;
  v_scope_ids uuid[];
  v_tz text := 'Asia/Jakarta';
  v_start_ts timestamptz;
  v_end_ts timestamptz;
  v_branch_target record;
  v_staff_target record;
  v_manual record;
  v_active_people integer := 0;
  v_target_order numeric := 0;
  v_target_gmv numeric := 0;
  v_order_realized numeric := 0;
  v_gmv_realized numeric := 0;
  v_expected_days integer := 0;
  v_attended_days integer := 0;
  v_order_pct numeric := 0;
  v_gmv_pct numeric := 0;
  v_attendance_pct numeric := 0;
  v_sop_pct numeric := 0;
  v_coaching_pct numeric := 0;
  v_coord_pct numeric := 0;
  v_score numeric := 0;
  v_complete boolean := true;
BEGIN
  IF p_staff_id IS NULL OR p_month IS NULL THEN
    RAISE EXCEPTION 'staff_id_and_month_required';
  END IF;

  IF v_caller IS NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF auth.role() <> 'service_role'
     AND v_caller <> p_staff_id
     AND v_caller_role <> ALL (ARRAY['admin','management','direksi','koordinator']) THEN
    RAISE EXCEPTION 'role_not_allowed';
  END IF;

  SELECT up.id, up.full_name, up.role, up.branch_id, up.is_active,
         b.code AS branch_code, b.name AS branch_name, b.parent_branch_id,
         COALESCE(NULLIF(b.timezone,''),'Asia/Jakarta') AS timezone
  INTO v_staff
  FROM public.user_profiles up
  JOIN public.branches b ON b.id = up.branch_id
  WHERE up.id = p_staff_id
    AND up.is_active = true
    AND lower(COALESCE(up.role,'')) IN ('staff','koordinator');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'active_staff_not_found';
  END IF;

  v_target_branch_id := COALESCE(v_staff.parent_branch_id, v_staff.branch_id);
  v_scope_ids := public.raos_branch_geofence_scope(v_target_branch_id);
  v_tz := v_staff.timezone;
  v_start_ts := v_month::timestamp AT TIME ZONE v_tz;
  v_end_ts := (v_month + interval '1 month')::timestamp AT TIME ZONE v_tz;

  SELECT b.id, b.code, b.name
  INTO v_branch
  FROM public.branches b
  WHERE b.id = v_target_branch_id;

  -- Six-pillar policy is SOETA-only. Other branches continue legacy payroll.
  IF upper(COALESCE(v_branch.code,'')) <> 'SOETA' THEN
    RAISE EXCEPTION 'soeta_only';
  END IF;

  SELECT * INTO v_branch_target
  FROM public.raos_kpi_targets_branch
  WHERE branch_id = v_target_branch_id
    AND effective_month = v_month
  LIMIT 1;

  SELECT * INTO v_staff_target
  FROM public.raos_kpi_targets_staff
  WHERE staff_id = p_staff_id
    AND effective_month = v_month
  LIMIT 1;

  SELECT * INTO v_manual
  FROM public.raos_soeta_kpi_manual_inputs
  WHERE staff_id = p_staff_id
    AND effective_month = v_month
  LIMIT 1;

  SELECT count(*)::integer INTO v_active_people
  FROM public.user_profiles up
  WHERE up.is_active = true
    AND lower(COALESCE(up.role,'')) IN ('staff','koordinator')
    AND up.branch_id = ANY (v_scope_ids);

  v_target_order := COALESCE(
    v_staff_target.target_order,
    v_branch_target.target_staff_default,
    CASE WHEN COALESCE(v_branch_target.target_cabang,0) > 0 AND v_active_people > 0
      THEN ceil(v_branch_target.target_cabang::numeric / v_active_people)
      ELSE 0 END,
    0
  );

  v_target_gmv := COALESCE(
    v_staff_target.target_gmv,
    CASE WHEN COALESCE(v_branch_target.target_gmv,0) > 0 AND v_active_people > 0
      THEN v_branch_target.target_gmv::numeric / v_active_people
      ELSE 0 END,
    0
  );

  SELECT count(*)::numeric,
         COALESCE(sum(s.gmv),0)::numeric
  INTO v_order_realized, v_gmv_realized
  FROM public.scan_orders s
  WHERE s.staff_id = p_staff_id
    AND s.status = 'valid'
    AND s.scanned_at >= v_start_ts
    AND s.scanned_at < v_end_ts;

  SELECT count(DISTINCT rs.tanggal)::integer
  INTO v_expected_days
  FROM public.raos_shift_schedules rs
  WHERE rs.staff_id = p_staff_id
    AND rs.tanggal >= v_month
    AND rs.tanggal < (v_month + interval '1 month')::date
    AND COALESCE(rs.status,'confirmed') <> 'cancelled';

  SELECT count(DISTINCT a.date)::integer
  INTO v_attended_days
  FROM public.raos_attendance a
  WHERE a.staff_id = p_staff_id
    AND a.date >= v_month
    AND a.date < (v_month + interval '1 month')::date
    AND a.check_in_at IS NOT NULL;

  v_order_pct := CASE WHEN v_target_order > 0
    THEN least(v_order_realized / v_target_order * 100, 100) ELSE 0 END;
  v_gmv_pct := CASE WHEN v_target_gmv > 0
    THEN least(v_gmv_realized / v_target_gmv * 100, 100) ELSE 0 END;
  v_attendance_pct := CASE WHEN v_expected_days > 0
    THEN least(v_attended_days::numeric / v_expected_days::numeric * 100, 100) ELSE 0 END;
  v_sop_pct := COALESCE(v_manual.sop_score,0);
  v_coaching_pct := COALESCE(v_manual.coaching_score,0);
  v_coord_pct := COALESCE(v_manual.coordinator_score,0);

  v_complete := (
    v_target_order > 0
    AND v_target_gmv > 0
    AND v_expected_days > 0
    AND v_manual.sop_score IS NOT NULL
    AND v_manual.coaching_score IS NOT NULL
    AND v_manual.coordinator_score IS NOT NULL
  );

  v_score := round(
      (v_order_pct * 0.40)
    + (v_gmv_pct * 0.20)
    + (v_attendance_pct * 0.15)
    + (v_sop_pct * 0.10)
    + (v_coaching_pct * 0.10)
    + (v_coord_pct * 0.05)
  , 2);

  RETURN jsonb_build_object(
    'staffId', p_staff_id,
    'fullName', v_staff.full_name,
    'effectiveMonth', v_month,
    'branchId', v_target_branch_id,
    'branchCode', v_branch.code,
    'complete', v_complete,
    'score', v_score,
    'pillars', jsonb_build_object(
      'order', jsonb_build_object('weight',40,'target',v_target_order,'realized',v_order_realized,'pct',round(v_order_pct,2),'weighted',round(v_order_pct*0.40,2)),
      'gmv', jsonb_build_object('weight',20,'target',v_target_gmv,'realized',v_gmv_realized,'pct',round(v_gmv_pct,2),'weighted',round(v_gmv_pct*0.20,2)),
      'attendance', jsonb_build_object('weight',15,'expectedDays',v_expected_days,'attendedDays',v_attended_days,'pct',round(v_attendance_pct,2),'weighted',round(v_attendance_pct*0.15,2)),
      'sop', jsonb_build_object('weight',10,'pct',v_sop_pct,'weighted',round(v_sop_pct*0.10,2)),
      'driverCoaching', jsonb_build_object('weight',10,'pct',v_coaching_pct,'weighted',round(v_coaching_pct*0.10,2)),
      'coordinatorAssessment', jsonb_build_object('weight',5,'pct',v_coord_pct,'weighted',round(v_coord_pct*0.05,2))
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.raos_soeta_kpi_staff_snapshot(uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.raos_soeta_kpi_staff_snapshot(uuid,date) TO authenticated, service_role;

COMMENT ON FUNCTION public.raos_soeta_kpi_staff_snapshot(uuid,date) IS
  'Canonical SOETA six-pillar KPI snapshot. Additive foundation; payroll cutover is a later gated migration after Preview QA.';
