ALTER TABLE public.raos_driver_staff_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raos_payroll ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS raos_driver_staff_assignment_read ON public.raos_driver_staff_assignment;
CREATE POLICY raos_driver_staff_assignment_read ON public.raos_driver_staff_assignment
  FOR SELECT TO authenticated
  USING (
    staff_id = auth.uid()
    OR public.get_my_role() = ANY (ARRAY['admin','management','direksi','koordinator'])
    OR public.is_branch_in_scope(branch_id)
  );

DROP POLICY IF EXISTS raos_driver_staff_assignment_write ON public.raos_driver_staff_assignment;
CREATE POLICY raos_driver_staff_assignment_write ON public.raos_driver_staff_assignment
  FOR ALL TO authenticated
  USING (public.get_my_role() = ANY (ARRAY['management','direksi']))
  WITH CHECK (public.get_my_role() = ANY (ARRAY['management','direksi']));

DROP POLICY IF EXISTS raos_payroll_read ON public.raos_payroll;
CREATE POLICY raos_payroll_read ON public.raos_payroll
  FOR SELECT TO authenticated
  USING (
    staff_id = auth.uid()
    OR public.get_my_role() = ANY (ARRAY['admin','management','direksi'])
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = raos_payroll.staff_id
        AND public.get_my_role() = 'koordinator'
        AND public.is_branch_in_scope(up.branch_id)
    )
  );

DROP POLICY IF EXISTS raos_payroll_write ON public.raos_payroll;
CREATE POLICY raos_payroll_write ON public.raos_payroll
  FOR ALL TO authenticated
  USING (public.get_my_role() = ANY (ARRAY['admin','management','direksi']))
  WITH CHECK (public.get_my_role() = ANY (ARRAY['admin','management','direksi']));
