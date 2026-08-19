-- RAOS 100 — canonical barcode assignment, scan submission, and order KPI snapshot
-- 2026-08-19. DRAFT UNTIL ARCHITECT APPLY GATE.

begin;

-- ---------------------------------------------------------------------
-- A. Dedicated canonical driver barcode assignment
-- ---------------------------------------------------------------------
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

  if caller_role not in ('admin','direksi','direktur') then
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
      returning d.id,d.barcode
    )
    select c.id,c.barcode,true from changed c;
    return;
  end if;

  if p_driver_id is null then
    raise exception 'driver_id_required';
  end if;

  return query
  with changed as (
    update public.raos_drivers d
    set barcode = case
          when nullif(btrim(d.barcode),'') is null
            then 'RAOS-DRV-' || upper(replace(d.id::text,'-',''))
          else d.barcode
        end,
        updated_at = case when nullif(btrim(d.barcode),'') is null then now() else d.updated_at end
    where d.id=p_driver_id and coalesce(d.is_active,true)=true
    returning d.id,d.barcode,(nullif(btrim(d.barcode),'') is not null)
  )
  select c.id,c.barcode,true from changed c;
end;
$$;

revoke all on function public.raos_assign_driver_barcode(uuid,boolean) from public, anon;
grant execute on function public.raos_assign_driver_barcode(uuid,boolean) to authenticated;

comment on function public.raos_assign_driver_barcode(uuid,boolean) is
'Assigns stable canonical RAOS-DRV-<driver UUID> barcode only to missing active drivers. Existing non-empty barcodes are preserved. Admin/Direksi/Direktur only.';

-- ---------------------------------------------------------------------
-- B. Canonical server-authoritative scan submission
-- ---------------------------------------------------------------------
create or replace function public.raos_submit_scan(
  p_driver_ref text,
  p_lat numeric,
  p_lng numeric,
  p_client_scan_id text,
  p_client_captured_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  prof record;
  captured_at timestamptz := coalesce(p_client_captured_at, now());
  scope_ids uuid[];
  drv record;
  geo record;
  pickup_id uuid;
  overshoot numeric;
  tolerance_m numeric := 500;
  existing public.scan_orders%rowtype;
  result_row public.scan_orders%rowtype;
  scan_id_val text;
begin
  if caller is null then
    raise exception 'unauthenticated' using errcode='28000';
  end if;
  if p_driver_ref is null or btrim(p_driver_ref)='' then
    raise exception 'invalid_input' using detail='driver_ref_required';
  end if;
  if p_client_scan_id is null or btrim(p_client_scan_id)='' then
    raise exception 'invalid_input' using detail='client_scan_id_required';
  end if;

  select id,role,branch_id,is_active,coalesce(is_geofence_exempt,false) exempt
  into prof
  from public.user_profiles
  where id=caller;

  if prof.id is null or not prof.is_active then raise exception 'profile_inactive'; end if;
  if lower(coalesce(prof.role,'')) <> 'staff' then raise exception 'role_not_allowed'; end if;
  if prof.branch_id is null then raise exception 'branch_not_assigned'; end if;

  -- Online path sends NULL and therefore uses server now(). Offline replay may
  -- supply original capture time, but only inside a bounded window.
  if p_client_captured_at is not null then
    if captured_at > now() + interval '5 minutes' then
      raise exception 'invalid_captured_at' using detail='future_timestamp';
    end if;
    if captured_at < now() - interval '24 hours' then
      raise exception 'invalid_captured_at' using detail='replay_too_old';
    end if;
  end if;

  scan_id_val := case
    when btrim(p_client_scan_id) like 'SCN-%' then btrim(p_client_scan_id)
    else 'SCN-' || btrim(p_client_scan_id)
  end;

  select * into existing from public.scan_orders where scan_id=scan_id_val for update;
  if existing.id is not null then
    return jsonb_build_object('status','already_submitted','row',to_jsonb(existing));
  end if;

  scope_ids := public.raos_branch_geofence_scope(prof.branch_id);

  select * into drv
  from public.raos_drivers
  where (barcode=btrim(p_driver_ref) or driver_id=btrim(p_driver_ref))
    and is_active=true
    and branch_id=any(scope_ids)
  limit 1;
  if drv.id is null then raise exception 'driver_not_found_in_scope'; end if;

  select nullif(value,'')::numeric into tolerance_m
  from public.system_config where key='GEOFENCE_TOLERANCE_METER';
  tolerance_m := coalesce(tolerance_m,500);

  if p_lat is not null and p_lng is not null then
    select gp.id,gp.name,gp.radius_meters,
      (6371000 * 2 * asin(sqrt(
        power(sin(radians((gp.latitude-p_lat)/2)),2) +
        cos(radians(p_lat))*cos(radians(gp.latitude))*
        power(sin(radians((gp.longitude-p_lng)/2)),2)
      ))) dist_m
    into geo
    from public.raos_geofence_points gp
    where gp.branch_id=any(scope_ids) and gp.is_active=true
    order by dist_m asc
    limit 1;
  end if;

  if p_lat is null or p_lng is null or geo.id is null then
    overshoot := null;
  else
    overshoot := greatest(0,round(geo.dist_m)-coalesce(geo.radius_meters,0));
    select pp.id into pickup_id from public.pickup_points pp where pp.id=geo.id limit 1;
  end if;

  if not prof.exempt and (overshoot is null or overshoot > tolerance_m) then
    raise exception 'geofence_blocked' using detail=coalesce('overshoot_m='||overshoot::text,'no_gps_or_no_geofence_in_scope');
  end if;

  insert into public.scan_orders(
    scan_id,driver_id,staff_id,pickup_point_id,scanned_at,
    latitude,longitude,status,
    koordinator_id,validated_at,admin_checked,admin_id,admin_checked_at,gmv,incentive
  ) values (
    scan_id_val,drv.id,caller,pickup_id,captured_at,
    p_lat,p_lng,'pending',
    null,null,false,null,null,0,0
  ) returning * into result_row;

  return jsonb_build_object(
    'status','submitted',
    'row',to_jsonb(result_row),
    'driver',jsonb_build_object('id',drv.id,'driver_id',drv.driver_id,'name',drv.name,'vehicle_plate',drv.vehicle_plate,'vehicle_type',drv.vehicle_type)
  );
end;
$$;

revoke all on function public.raos_submit_scan(text,numeric,numeric,text,timestamptz) from public, anon;
grant execute on function public.raos_submit_scan(text,numeric,numeric,text,timestamptz) to authenticated;

comment on function public.raos_submit_scan(text,numeric,numeric,text,timestamptz) is
'Canonical Staff scan submit. auth.uid, active profile, branch scope, active driver, geofence, status and validator fields are server authoritative. Online uses server time; offline replay is bounded to 24h. Idempotent on scan_id.';

-- Once UI/offline replay are wired to raos_submit_scan, block raw Staff INSERT.
drop policy if exists scan_orders_staff_insert on public.scan_orders;

-- ---------------------------------------------------------------------
-- C. Order-mode Staff target + Staff/Koordinator canonical KPI snapshot
-- ---------------------------------------------------------------------
alter table public.raos_kpi_targets_staff
  add column if not exists target_order bigint;

comment on column public.raos_kpi_targets_staff.target_order is
'Explicit monthly order/scan target for a Staff. NULL means inherit branch default or derived equal-share branch target.';

create or replace function public.raos_order_kpi_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
  staff_target record;
  active_staff_count integer := 0;
  realized_count bigint := 0;
  target_value bigint := 0;
  target_source text := 'unset';
  scope_mode text := 'staff';
begin
  if caller is null then raise exception 'unauthenticated' using errcode='28000'; end if;

  select id,role,branch_id,is_active into prof
  from public.user_profiles where id=caller;
  if prof.id is null or not prof.is_active then raise exception 'profile_inactive'; end if;
  if prof.branch_id is null then raise exception 'branch_not_assigned'; end if;

  select id,parent_branch_id,coalesce(timezone,'Asia/Jakarta') timezone into br
  from public.branches where id=prof.branch_id;
  target_branch := coalesce(br.parent_branch_id,prof.branch_id);
  scope_ids := public.raos_branch_geofence_scope(target_branch);

  month_start := date_trunc('month', timezone(br.timezone,now()))::date;
  start_ts := month_start::timestamp at time zone br.timezone;
  end_ts := (month_start + interval '1 month')::timestamp at time zone br.timezone;

  select * into branch_target
  from public.raos_kpi_targets_branch
  where branch_id=target_branch and effective_month=month_start
  limit 1;

  if branch_target.id is null or branch_target.mode <> 'order' then
    return jsonb_build_object(
      'effectiveMonth',month_start,'mode',coalesce(branch_target.mode,'unset'),
      'scope','staff','target',0,'realized',0,'achievementPct',0,'source','unset',
      'branchTarget',coalesce(branch_target.target_cabang,0)
    );
  end if;

  select count(*) into active_staff_count
  from public.user_profiles up
  where up.is_active=true and lower(coalesce(up.role,''))='staff' and up.branch_id=any(scope_ids);

  if lower(coalesce(prof.role,''))='staff' then
    select * into staff_target
    from public.raos_kpi_targets_staff
    where staff_id=caller and effective_month=month_start
    limit 1;

    if staff_target.target_order is not null then
      target_value := staff_target.target_order;
      target_source := 'staff_override';
    elsif branch_target.target_staff_default is not null then
      target_value := branch_target.target_staff_default;
      target_source := 'branch_default';
    elsif active_staff_count > 0 then
      target_value := ceil(branch_target.target_cabang::numeric/active_staff_count)::bigint;
      target_source := 'derived_equal_share';
    end if;

    select count(*) into realized_count
    from public.scan_orders s
    where s.staff_id=caller and s.status='valid'
      and s.scanned_at>=start_ts and s.scanned_at<end_ts;
  elsif lower(coalesce(prof.role,'')) in ('koordinator','admin','management','direksi','direktur') then
    scope_mode := 'branch';
    target_value := branch_target.target_cabang;
    target_source := 'branch_target';

    select count(*) into realized_count
    from public.scan_orders s
    join public.user_profiles up on up.id=s.staff_id
    where s.status='valid'
      and up.branch_id=any(scope_ids)
      and s.scanned_at>=start_ts and s.scanned_at<end_ts;
  else
    raise exception 'role_not_allowed';
  end if;

  return jsonb_build_object(
    'effectiveMonth',month_start,
    'mode','order',
    'scope',scope_mode,
    'target',target_value,
    'realized',realized_count,
    'achievementPct',case when target_value>0 then least(realized_count::numeric/target_value*100,999) else 0 end,
    'source',target_source,
    'branchTarget',branch_target.target_cabang,
    'activeStaff',active_staff_count,
    'targetBranchId',target_branch
  );
end;
$$;

revoke all on function public.raos_order_kpi_snapshot() from public, anon;
grant execute on function public.raos_order_kpi_snapshot() to authenticated;

comment on function public.raos_order_kpi_snapshot() is
'Canonical order KPI snapshot. Staff sees own valid scans against explicit/default/derived Staff target. Koordinator/management/admin/direksi see canonical parent branch aggregate against target_cabang; SOETA includes T1/T2/T3 via shared scope resolver.';

commit;
