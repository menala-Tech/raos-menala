do $$
declare
  v_primary_direksi uuid;
begin
  select id into v_primary_direksi
  from public.user_profiles
  where lower(role) in ('direksi','direktur') and is_active=true
  order by created_at asc
  limit 1;

  if v_primary_direksi is null then
    raise exception 'active_direksi_required';
  end if;

  update public.doc_approval_rules
  set approvers = array[v_primary_direksi]::uuid[],
      mode = 'sequential'::public.doc_approval_mode,
      updated_at = now()
  where is_active=true;
end $$;

drop policy if exists doc_approvals_update on public.doc_approvals;
create policy doc_approvals_update
on public.doc_approvals
for update
to authenticated
using (
  approver_id = auth.uid()
  and lower(public.get_my_role()) in ('direksi','direktur')
)
with check (
  approver_id = auth.uid()
  and lower(public.get_my_role()) in ('direksi','direktur')
);
