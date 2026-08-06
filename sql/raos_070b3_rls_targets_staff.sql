ALTER TABLE public.raos_kpi_targets_staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS raos_kpi_targets_staff_read ON public.raos_kpi_targets_staff;
CREATE POLICY raos_kpi_targets_staff_read ON public.raos_kpi_targets_staff
  FOR SELECT TO authenticated
  USING (
    staff_id = auth.uid()
    OR public.get_my_role() = ANY (ARRAY['admin','management','direksi'])
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = raos_kpi_targets_staff.staff_id AND public.is_branch_in_scope(up.branch_id)
    )
  );

DROP POLICY IF EXISTS raos_kpi_targets_staff_write ON public.raos_kpi_targets_staff;
CREATE POLICY raos_kpi_targets_staff_write ON public.raos_kpi_targets_staff
  FOR ALL TO authenticated
  USING (public.get_my_role() = ANY (ARRAY['admin','management','direksi']))
  WITH CHECK (public.get_my_role() = ANY (ARRAY['admin','management','direksi']));
