-- raos_102_admin_head_office_kpi
-- Canonical rule: role=admin belongs to Head Office / national scope and MUST NOT carry branch_id.
-- Also adds a server-authoritative branch KPI snapshot for Admin selectors.

create or replace function public.raos_force_admin_head_office()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if lower(coalesce(new.role,'')) = 'admin' then
    new.branch_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_raos_force_admin_head_office on public.user_profiles;
create trigger trg_raos_force_admin_head_office
before insert or update of role, branch_id on public.user_profiles
for each row execute function public.raos_force_admin_head_office();

-- One-time cleanup of stale branch assignments already attached to Admin accounts.
update public.user_profiles
set branch_id = null
where lower(coalesce(role,'')) = 'admin'
  and branch_id is not null;

create or replace function public.raos_admin_branch_kpi_snapshot(p_branch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_role text;
  selected_br record;
  target_br record;
  target_branch uuid;
  scope_ids uuid[];
  month_start date;
  start_ts timestamptz;
  end_ts timestamptz;
  bt record;
  active_staff_count integer := 0;
  realized_value bigint := 0;
  target_value bigint := 0;
  mode_value text := 'unset';
begin
  if caller is null then
    raise exception 'unauthenticated' using errcode='28000';
  end if;

  select lower(coalesce(role,'')) into caller_role
  from public.user_profiles
  where id=caller and is_active=true;

  if caller_role not in ('admin','direksi','direktur','management') then
    raise exception 'role_not_allowed';
  end if;

  if p_branch_id is null then raise exception 'branch_id_required'; end if;

  select id,code,name,parent_branch_id,coalesce(timezone,'Asia/Jakarta') timezone
    into selected_br
  from public.branches
  where id=p_branch_id and is_active is distinct from false;
  if selected_br.id is null then raise exception 'branch_not_found_or_inactive'; end if;

  target_branch := coalesce(selected_br.parent_branch_id,selected_br.id);
  select id,code,name,parent_branch_id,coalesce(timezone,'Asia/Jakarta') timezone
    into target_br
  from public.branches where id=target_branch;

  scope_ids := public.raos_branch_geofence_scope(target_branch);
  month_start := date_trunc('month', timezone(target_br.timezone,now()))::date;
  start_ts := month_start::timestamp at time zone target_br.timezone;
  end_ts := (month_start + interval '1 month')::timestamp at time zone target_br.timezone;

  select * into bt
  from public.raos_kpi_targets_branch
  where branch_id=target_branch and effective_month=month_start
  limit 1;

  if bt.id is null then
    return jsonb_build_object(
      'effectiveMonth',month_start,
      'selectedBranchId',selected_br.id,
      'targetBranchId',target_branch,
      'branchCode',target_br.code,
      'branchName',target_br.name,
      'timezone',target_br.timezone,
      'mode','unset','target',0,'realized',0,'achievementPct',0,'activeStaff',0
    );
  end if;

  mode_value := bt.mode;
  target_value := coalesce(bt.target_cabang,0);

  select count(*) into active_staff_count
  from public.user_profiles up
  where up.is_active=true
    and lower(coalesce(up.role,''))='staff'
    and up.branch_id=any(scope_ids);

  if mode_value='order' then
    select count(*) into realized_value
    from public.scan_orders s
    join public.user_profiles up on up.id=s.staff_id
    where s.status='valid'
      and up.branch_id=any(scope_ids)
      and s.scanned_at>=start_ts and s.scanned_at<end_ts;
  elsif mode_value='saldo' then
    select coalesce(sum(v.realisasi_saldo),0)::bigint into realized_value
    from public.raos_target_tercapai_bulan v
    join public.user_profiles up on up.id=v.staff_id
    where v.effective_month=month_start
      and up.branch_id=any(scope_ids);
  else
    realized_value := 0;
  end if;

  return jsonb_build_object(
    'effectiveMonth',month_start,
    'selectedBranchId',selected_br.id,
    'targetBranchId',target_branch,
    'branchCode',target_br.code,
    'branchName',target_br.name,
    'timezone',target_br.timezone,
    'mode',mode_value,
    'target',target_value,
    'realized',realized_value,
    'achievementPct',case when target_value>0 then least(realized_value::numeric/target_value*100,999) else 0 end,
    'activeStaff',active_staff_count,
    'derivedStaffTarget',case when mode_value='order' and active_staff_count>0 then ceil(target_value::numeric/active_staff_count)::bigint else null end
  );
end;
$$;

revoke all on function public.raos_admin_branch_kpi_snapshot(uuid) from public;
grant execute on function public.raos_admin_branch_kpi_snapshot(uuid) to authenticated;
