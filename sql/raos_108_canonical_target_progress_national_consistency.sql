-- raos_108_canonical_target_progress_national_consistency
-- 2026-08-20
--
-- Goal:
-- 1) Remove legacy kpi_targets dependency from chat progress snapshot.
-- 2) Make branch mode source canonical: raos_kpi_targets_branch.mode.
-- 3) Make equal-share denominator consistently active Staff + Koordinator.
-- 4) Make equal-share rounding consistently CEIL, matching canonical
--    raos_saldo_kpi_snapshot()/raos_order_kpi_snapshot().
--
-- No table/RLS changes. Existing canonical target sources are reused:
-- raos_kpi_targets_staff, raos_kpi_targets_branch,
-- raos_target_tercapai_bulan, scan_orders.

create or replace function public.raos_saldo_progress_snapshot(p_staff_id uuid)
returns table(mode text, target_val numeric, realisasi_val numeric, pct numeric)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  prof record;
  br record;
  target_branch uuid;
  scope_ids uuid[];
  month_start date;
  start_ts timestamptz;
  end_ts timestamptz;
  branch_target record;
  staff_target record;
  active_people_count integer := 0;
begin
  select up.id,up.role,up.branch_id,up.is_active
    into prof
  from public.user_profiles up
  where up.id=p_staff_id;

  if prof.id is null or not prof.is_active or prof.branch_id is null then
    mode := 'unset'; target_val := 0; realisasi_val := 0; pct := 0;
    return next; return;
  end if;

  select b.id,b.parent_branch_id,coalesce(b.timezone,'Asia/Jakarta') timezone
    into br
  from public.branches b
  where b.id=prof.branch_id;

  target_branch := coalesce(br.parent_branch_id,prof.branch_id);
  scope_ids := public.raos_branch_geofence_scope(target_branch);
  month_start := date_trunc('month', timezone(br.timezone,now()))::date;
  start_ts := month_start::timestamp at time zone br.timezone;
  end_ts := (month_start + interval '1 month')::timestamp at time zone br.timezone;

  select t.* into branch_target
  from public.raos_kpi_targets_branch t
  where t.branch_id=target_branch and t.effective_month=month_start
  limit 1;

  if branch_target.id is null then
    mode := 'unset'; target_val := 0; realisasi_val := 0; pct := 0;
    return next; return;
  end if;

  mode := lower(coalesce(branch_target.mode,'saldo'));

  select count(*) into active_people_count
  from public.user_profiles up
  where up.is_active=true
    and lower(coalesce(up.role,'')) in ('staff','koordinator')
    and up.branch_id=any(scope_ids);

  select st.* into staff_target
  from public.raos_kpi_targets_staff st
  where st.staff_id=p_staff_id and st.effective_month=month_start
  limit 1;

  if mode='order' then
    target_val := coalesce(
      staff_target.target_order,
      branch_target.target_staff_default,
      case when active_people_count>0
        then ceil(branch_target.target_cabang::numeric/active_people_count)
        else 0 end,
      0
    );

    select count(*)::numeric into realisasi_val
    from public.scan_orders s
    where s.staff_id=p_staff_id
      and s.status='valid'
      and s.scanned_at>=start_ts and s.scanned_at<end_ts;
  elsif mode='saldo' then
    target_val := coalesce(
      staff_target.target_saldo,
      branch_target.target_staff_default,
      case when active_people_count>0
        then ceil(branch_target.target_cabang::numeric/active_people_count)
        else 0 end,
      0
    );

    select coalesce(t.realisasi_saldo,0)::numeric into realisasi_val
    from public.raos_target_tercapai_bulan t
    where t.staff_id=p_staff_id and t.effective_month=month_start;
    realisasi_val := coalesce(realisasi_val,0);
  else
    target_val := 0;
    realisasi_val := 0;
  end if;

  pct := case when coalesce(target_val,0)>0
    then round(coalesce(realisasi_val,0)*100.0/target_val,1)
    else 0 end;
  return next;
end;
$function$;

comment on function public.raos_saldo_progress_snapshot(uuid) is
  'Canonical personal KPI progress used by saldo processed chat notifications. Reads raos_kpi_targets_staff/branch only, uses branch mode, Staff+Koordinator denominator, and CEIL equal-share; legacy kpi_targets is not used.';

revoke all on function public.raos_saldo_progress_snapshot(uuid) from public, anon;
grant execute on function public.raos_saldo_progress_snapshot(uuid) to authenticated, service_role;

-- National/Admin branch KPI snapshot: target-bearing denominator is
-- Staff + Koordinator, same as personal canonical snapshots.
create or replace function public.raos_admin_branch_kpi_snapshot(p_branch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  if caller is null then raise exception 'unauthenticated' using errcode='28000'; end if;

  select lower(coalesce(role,'')) into caller_role
  from public.user_profiles where id=caller and is_active=true;
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
    into target_br from public.branches where id=target_branch;

  scope_ids := public.raos_branch_geofence_scope(target_branch);
  month_start := date_trunc('month', timezone(target_br.timezone,now()))::date;
  start_ts := month_start::timestamp at time zone target_br.timezone;
  end_ts := (month_start + interval '1 month')::timestamp at time zone target_br.timezone;

  select * into bt from public.raos_kpi_targets_branch
  where branch_id=target_branch and effective_month=month_start limit 1;

  if bt.id is null then
    return jsonb_build_object(
      'effectiveMonth',month_start,'selectedBranchId',selected_br.id,
      'targetBranchId',target_branch,'branchCode',target_br.code,
      'branchName',target_br.name,'timezone',target_br.timezone,
      'mode','unset','target',0,'realized',0,'achievementPct',0,
      'activeStaff',0,'activePeople',0
    );
  end if;

  mode_value := bt.mode;
  target_value := coalesce(bt.target_cabang,0);

  select count(*) into active_staff_count
  from public.user_profiles up
  where up.is_active=true
    and lower(coalesce(up.role,'')) in ('staff','koordinator')
    and up.branch_id=any(scope_ids);

  if mode_value='order' then
    select count(*) into realized_value
    from public.scan_orders s
    join public.user_profiles up on up.id=s.staff_id
    where s.status='valid' and up.branch_id=any(scope_ids)
      and s.scanned_at>=start_ts and s.scanned_at<end_ts;
  elsif mode_value='saldo' then
    select coalesce(sum(v.realisasi_saldo),0)::bigint into realized_value
    from public.raos_target_tercapai_bulan v
    join public.user_profiles up on up.id=v.staff_id
    where v.effective_month=month_start and up.branch_id=any(scope_ids);
  else
    realized_value := 0;
  end if;

  return jsonb_build_object(
    'effectiveMonth',month_start,'selectedBranchId',selected_br.id,
    'targetBranchId',target_branch,'branchCode',target_br.code,
    'branchName',target_br.name,'timezone',target_br.timezone,
    'mode',mode_value,'target',target_value,'realized',realized_value,
    'achievementPct',case when target_value>0 then least(realized_value::numeric/target_value*100,999) else 0 end,
    'activeStaff',active_staff_count,
    'activePeople',active_staff_count,
    'derivedStaffTarget',case when mode_value in ('order','saldo') and active_staff_count>0
      then ceil(target_value::numeric/active_staff_count)::bigint else null end
  );
end;
$function$;

-- Payroll uses the same derived equal-share rounding as canonical KPI snapshots.
-- Only ROUND -> CEIL changes below; all bonus/status/security logic is preserved.
do $do$
declare
  fn text;
begin
  fn := pg_get_functiondef('public.raos_compute_payroll_month(date)'::regprocedure);
  fn := replace(fn,
    'v_effective_default:=round(v_target.target_cabang::numeric/v_branch_staff_count)::bigint;',
    'v_effective_default:=ceil(v_target.target_cabang::numeric/v_branch_staff_count)::bigint;');
  execute fn;

  fn := pg_get_functiondef('public.raos_compute_payroll_staff(date,uuid)'::regprocedure);
  fn := replace(fn,
    'v_effective_default:=round(v_target.target_cabang::numeric/v_branch_staff_count)::bigint;',
    'v_effective_default:=ceil(v_target.target_cabang::numeric/v_branch_staff_count)::bigint;');
  execute fn;
end;
$do$;
