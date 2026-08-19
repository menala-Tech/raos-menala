-- RAOS 100c — branch-reader profile visibility needed by canonical history/RLS.
-- Koordinator has staff:read/history:branch:read capability but production
-- user_profiles RLS previously exposed only self/admin, which made scan_orders
-- branch policy's staff->branch lookup resolve to NULL for Koordinator.

create policy user_profiles_select_branch_readers
on public.user_profiles
for select
to authenticated
using (
  public.get_my_role() in ('koordinator','management')
  and public.is_branch_in_scope(branch_id)
);
