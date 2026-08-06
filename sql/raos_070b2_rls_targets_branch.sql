ALTER TABLE public.raos_kpi_targets_branch ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS raos_kpi_targets_branch_read ON public.raos_kpi_targets_branch;
CREATE POLICY raos_kpi_targets_branch_read ON public.raos_kpi_targets_branch
  FOR SELECT TO authenticated
  USING (public.is_branch_in_scope(branch_id));

DROP POLICY IF EXISTS raos_kpi_targets_branch_write ON public.raos_kpi_targets_branch;
CREATE POLICY raos_kpi_targets_branch_write ON public.raos_kpi_targets_branch
  FOR ALL TO authenticated
  USING (public.get_my_role() = ANY (ARRAY['admin','management','direksi']))
  WITH CHECK (public.get_my_role() = ANY (ARRAY['admin','management','direksi']));
