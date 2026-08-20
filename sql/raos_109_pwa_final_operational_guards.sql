-- RAOS 109 — PWA final operational guards
-- 2026-08-20
-- Scope:
-- 1) Attendance checkout gets the same server-side geofence enforcement as check-in.
-- 2) Barcode queue join fails closed on missing GPS for operational staff/driver_manager,
--    while preserving existing Admin/Direksi remote-override behavior and geofence exemptions.
-- No table/RLS shape changes.

begin;

create or replace function public.raos_attendance_check_out(
  p_lat numeric,
  p_lng numeric,
  p_selfie_url text,
  p_client_captured_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  caller uuid := auth.uid();
  prof record;
  br record;
  server_now timestamptz := now();
  captured_at timestamptz;
  local_date date;
  existing record;
  result_row public.raos_attendance%rowtype;
  scope_ids uuid[];
  geo record;
  overshoot numeric;
begin
  if caller is null then raise exception 'unauthenticated' using errcode = '28000'; end if;

  if p_client_captured_at is null then
    captured_at := server_now;
  elsif p_client_captured_at > server_now + interval '2 minutes' then
    raise exception 'captured_at_future';
  elsif p_client_captured_at < server_now - interval '24 hours' then
    raise exception 'offline_replay_expired';
  elsif p_client_captured_at >= server_now - interval '5 minutes' then
    captured_at := server_now;
  else
    captured_at := p_client_captured_at;
  end if;

  select id, role, branch_id, is_active, coalesce(is_geofence_exempt,false) as exempt
    into prof
    from public.user_profiles
    where id = caller;
  if prof.id is null or not prof.is_active then raise exception 'profile_inactive'; end if;
  if lower(coalesce(prof.role,'')) not in ('staff','koordinator') then raise exception 'role_not_allowed'; end if;
  if prof.branch_id is null then raise exception 'branch_not_assigned'; end if;

  select id, coalesce(timezone,'Asia/Jakarta') as timezone into br
    from public.branches where id = prof.branch_id;
  if br.id is null then raise exception 'branch_not_found'; end if;

  local_date := (captured_at at time zone br.timezone)::date;

  select * into existing
    from public.raos_attendance
    where staff_id = caller and date = local_date
    for update;

  if existing.staff_id is null or existing.check_in_at is null then raise exception 'not_checked_in'; end if;
  if captured_at < existing.check_in_at then raise exception 'checkout_before_checkin'; end if;

  if existing.check_out_at is not null and existing.check_out_at >= captured_at then
    return jsonb_build_object('status','already_checked_out','row',to_jsonb(existing));
  end if;

  -- Canonical server-side geofence parity with check-in. Browser/UI checks are UX only.
  scope_ids := public.raos_branch_geofence_scope(prof.branch_id);
  if p_lat is not null and p_lng is not null then
    select gp.id, gp.name, gp.radius_meters,
      (6371000 * 2 * asin(sqrt(
        power(sin(radians((gp.latitude - p_lat)/2)), 2) +
        cos(radians(p_lat)) * cos(radians(gp.latitude)) *
        power(sin(radians((gp.longitude - p_lng)/2)), 2)
      ))) as dist_m
    into geo
    from public.raos_geofence_points gp
    where gp.branch_id = any(scope_ids) and gp.is_active = true
    order by dist_m asc
    limit 1;
  end if;

  if p_lat is null or p_lng is null or geo.id is null then
    overshoot := null;
  else
    overshoot := greatest(0, round(geo.dist_m) - geo.radius_meters);
  end if;

  if not prof.exempt and (overshoot is null or overshoot > 500) then
    raise exception 'geofence_blocked' using
      detail = coalesce('overshoot_m=' || overshoot::text, 'no_gps_or_no_pickup_point_in_scope');
  end if;

  update public.raos_attendance set
    check_out_at = captured_at,
    check_out_lat = p_lat,
    check_out_lng = p_lng,
    selfie_out_url = p_selfie_url
  where staff_id = caller and date = local_date
  returning * into result_row;

  return jsonb_build_object('status','checked_out','row',to_jsonb(result_row));
end;
$function$;

revoke all on function public.raos_attendance_check_out(numeric,numeric,text,timestamptz) from public, anon;
grant execute on function public.raos_attendance_check_out(numeric,numeric,text,timestamptz) to authenticated, service_role;

create or replace function public.raos_join_queue_by_barcode(
  p_barcode text,
  p_branch_id uuid,
  p_room_id uuid default null,
  p_staff_lat numeric default null,
  p_staff_lng numeric default null
)
returns table(queue_id uuid, queue_pos integer, driver_name text, driver_id_text text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r text;
  v_driver public.raos_drivers%rowtype;
  v_branch public.branches%rowtype;
  v_pos integer;
  v_id uuid;
  v_dist_m numeric;
  v_cos_arg numeric;
  v_exempt boolean := false;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  r:=lower(coalesce(public.get_my_role(),''));
  if r not in ('staff','admin','direksi','direktur','driver_manager') then raise exception 'role_not_allowed'; end if;
  if p_branch_id is null or nullif(btrim(coalesce(p_barcode,'')),'') is null then raise exception 'invalid_input'; end if;
  if not public.is_branch_in_scope(p_branch_id) then raise exception 'branch_not_in_scope'; end if;

  select coalesce(is_geofence_exempt,false) into v_exempt
    from public.user_profiles where id=auth.uid() and is_active=true;

  select * into v_branch from public.branches where id=p_branch_id and is_active is distinct from false for update;
  if not found then raise exception 'branch_not_found_or_inactive'; end if;

  select * into v_driver
  from public.raos_drivers
  where lower(btrim(barcode))=lower(btrim(p_barcode)) and is_active=true
  limit 1;
  if not found then raise exception 'driver_not_found_by_barcode'; end if;
  if v_driver.branch_id is distinct from p_branch_id then raise exception 'driver_wrong_branch'; end if;

  if p_room_id is not null and not exists (
    select 1
    from public.chat_rooms cr
    left join public.branches rb on rb.id=cr.branch_id
    where cr.id=p_room_id and cr.is_active=true and cr.branch_id is not null
      and (cr.branch_id=p_branch_id or cr.branch_id=v_branch.parent_branch_id or rb.parent_branch_id=p_branch_id)
  ) then
    raise exception 'room_branch_mismatch';
  end if;

  -- Barcode queue join is an on-site operational action for Staff/Driver Manager.
  -- Fail closed when GPS is absent/unconfigured; exempt identities preserve their
  -- explicit operational exemption. Admin/Direksi keep the existing remote override.
  if r in ('staff','driver_manager') and not v_exempt then
    if p_staff_lat is null or p_staff_lng is null then raise exception 'gps_required'; end if;
    if v_branch.latitude is null or v_branch.longitude is null then raise exception 'geofence_not_configured'; end if;
  end if;

  if p_staff_lat is not null and p_staff_lng is not null
     and v_branch.latitude is not null and v_branch.longitude is not null then
    v_cos_arg := cos(radians(v_branch.latitude)) * cos(radians(p_staff_lat)) *
                 cos(radians(p_staff_lng)-radians(v_branch.longitude)) +
                 sin(radians(v_branch.latitude)) * sin(radians(p_staff_lat));
    v_dist_m := 6371000 * acos(least(1::numeric,greatest(-1::numeric,v_cos_arg))::double precision);
    if not v_exempt and v_dist_m > coalesce(v_branch.default_radius_meters,500)+100 then
      raise exception 'gps_out_of_range: %m dari cabang', round(v_dist_m);
    end if;
  end if;

  if exists(select 1 from public.raos_driver_queue where driver_id=v_driver.id and status in ('waiting','called')) then
    raise exception 'driver_already_in_queue';
  end if;

  select coalesce(max(q.position),0)+1 into v_pos
  from public.raos_driver_queue q
  where q.branch_id=p_branch_id and q.status in ('waiting','called');

  insert into public.raos_driver_queue(driver_id,branch_id,position,status,chat_room_id)
  values(v_driver.id,p_branch_id,v_pos,'waiting',p_room_id)
  returning id into v_id;

  return query select v_id,v_pos,v_driver.name,v_driver.driver_id;
end $function$;

revoke all on function public.raos_join_queue_by_barcode(text,uuid,uuid,numeric,numeric) from public, anon;
grant execute on function public.raos_join_queue_by_barcode(text,uuid,uuid,numeric,numeric) to authenticated, service_role;

commit;
