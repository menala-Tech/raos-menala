-- RAOS 100b — align barcode RPC with existing driver:barcode:manage capability.
-- Apply immediately after raos_100.

create or replace function public.raos_assign_driver_barcode(
  p_driver_id uuid default null,
  p_all_missing boolean default false
)
returns table(driver_uuid uuid, barcode text, assigned boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_role text;
begin
  if caller is null then
    raise exception 'unauthenticated' using errcode='28000';
  end if;

  select lower(coalesce(role,'')) into caller_role
  from public.user_profiles
  where id=caller and is_active=true;

  if caller_role not in ('admin','direksi','direktur','driver_manager') then
    raise exception 'role_not_allowed';
  end if;

  if p_all_missing then
    return query
    with changed as (
      update public.raos_drivers d
      set barcode = 'RAOS-DRV-' || upper(replace(d.id::text,'-','')),
          updated_at = now()
      where coalesce(d.is_active,true)=true
        and nullif(btrim(d.barcode),'') is null
        and (
          caller_role in ('admin','direksi','direktur')
          or (caller_role='driver_manager' and public.is_branch_in_scope(d.branch_id))
        )
      returning d.id,d.barcode
    )
    select c.id,c.barcode,true from changed c;
    return;
  end if;

  if p_driver_id is null then raise exception 'driver_id_required'; end if;

  return query
  with changed as (
    update public.raos_drivers d
    set barcode = case
          when nullif(btrim(d.barcode),'') is null
            then 'RAOS-DRV-' || upper(replace(d.id::text,'-',''))
          else d.barcode
        end,
        updated_at = case when nullif(btrim(d.barcode),'') is null then now() else d.updated_at end
    where d.id=p_driver_id
      and coalesce(d.is_active,true)=true
      and (
        caller_role in ('admin','direksi','direktur')
        or (caller_role='driver_manager' and public.is_branch_in_scope(d.branch_id))
      )
    returning d.id,d.barcode
  )
  select c.id,c.barcode,true from changed c;
end;
$$;

revoke all on function public.raos_assign_driver_barcode(uuid,boolean) from public, anon;
grant execute on function public.raos_assign_driver_barcode(uuid,boolean) to authenticated;
