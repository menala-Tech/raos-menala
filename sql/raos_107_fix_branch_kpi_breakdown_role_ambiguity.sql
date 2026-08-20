-- Follow-up to raos_106: fix PL/pgSQL output-column ambiguity in
-- raos_branch_kpi_breakdown(). Production verification found that the
-- RETURNS TABLE output column `role` conflicted with unqualified
-- user_profiles.role in the profile lookup. Qualify source columns so the
-- function executes correctly while preserving behavior and scope.

create or replace function public.raos_branch_kpi_breakdown()
returns table(
  staff_id uuid,
  full_name text,
  role text,
  target_saldo bigint,
  realized_saldo bigint,
  pct_saldo numeric,
  target_order bigint,
  realized_order bigint,
  pct_order numeric
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  caller uuid := auth.uid();
  prof record;
  br record;
  target_branch uuid;
  scope_ids uuid[];
  month_start date;
  start_ts timestamptz;
  end_ts timestamptz;
  branch_target record;
  active_people_count integer := 0;
  default_share bigint := 0;
begin
  if caller is null then raise exception 'unauthenticated' using errcode='28000'; end if;

  select up0.id,up0.role,up0.branch_id,up0.is_active into prof
  from public.user_profiles up0 where up0.id=caller;
  if prof.id is null or not prof.is_active then raise exception 'profile_inactive'; end if;
  if lower(coalesce(prof.role,'')) not in ('koordinator','admin','management','direksi','direktur') then
    raise exception 'role_not_allowed';
  end if;
  if prof.branch_id is null then raise exception 'branch_not_assigned'; end if;

  select b0.id,b0.parent_branch_id,coalesce(b0.timezone,'Asia/Jakarta') timezone into br
  from public.branches b0 where b0.id=prof.branch_id;
  target_branch := coalesce(br.parent_branch_id,prof.branch_id);
  scope_ids := public.raos_branch_geofence_scope(target_branch);

  month_start := date_trunc('month', timezone(br.timezone,now()))::date;
  start_ts := month_start::timestamp at time zone br.timezone;
  end_ts := (month_start + interval '1 month')::timestamp at time zone br.timezone;

  select kpb.* into branch_target
  from public.raos_kpi_targets_branch kpb
  where kpb.branch_id=target_branch and kpb.effective_month=month_start
  limit 1;

  select count(*) into active_people_count
  from public.user_profiles up
  where up.is_active=true and lower(coalesce(up.role,'')) in ('staff','koordinator') and up.branch_id=any(scope_ids);

  if active_people_count > 0 and branch_target.id is not null then
    default_share := ceil(coalesce(branch_target.target_cabang,0)::numeric/active_people_count)::bigint;
  end if;

  return query
  with roster as (
    select
      up.id as r_staff_id,
      up.full_name as r_full_name,
      up.role as r_role,
      (case when coalesce(branch_target.mode,'saldo')='saldo'
        then coalesce(kt.target_saldo, branch_target.target_staff_default, default_share, 0)
        else 0 end)::bigint as r_target_saldo,
      coalesce(ttb.realisasi_saldo,0)::bigint as r_realized_saldo,
      (case when coalesce(branch_target.mode,'saldo')='order'
        then coalesce(kt.target_order, branch_target.target_staff_default, default_share, 0)
        else 0 end)::bigint as r_target_order,
      coalesce((
        select count(*) from public.scan_orders s
        where s.staff_id=up.id and s.status='valid'
          and s.scanned_at>=start_ts and s.scanned_at<end_ts
      ),0)::bigint as r_realized_order
    from public.user_profiles up
    left join public.raos_kpi_targets_staff kt
      on kt.staff_id=up.id and kt.effective_month=month_start
    left join public.raos_target_tercapai_bulan ttb
      on ttb.staff_id=up.id and ttb.effective_month=month_start
    where up.is_active=true
      and lower(coalesce(up.role,'')) in ('staff','koordinator')
      and up.branch_id=any(scope_ids)
  )
  select
    r_staff_id, r_full_name, r_role,
    r_target_saldo, r_realized_saldo,
    (case when r_target_saldo>0 then least(r_realized_saldo::numeric/r_target_saldo*100,999) else 0 end)::numeric,
    r_target_order, r_realized_order,
    (case when r_target_order>0 then least(r_realized_order::numeric/r_target_order*100,999) else 0 end)::numeric
  from roster
  order by r_full_name;
end;
$function$;

comment on function public.raos_branch_kpi_breakdown() is
  'Per-person Staff+Koordinator KPI breakdown for the callers own branch. Own-branch scope is derived server-side from caller branch_id. Qualified aliases avoid PL/pgSQL output-column ambiguity.';

revoke all on function public.raos_branch_kpi_breakdown() from public, anon;
grant execute on function public.raos_branch_kpi_breakdown() to authenticated, service_role;
