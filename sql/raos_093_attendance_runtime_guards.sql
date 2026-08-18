-- RAOS 093 — attendance captured-time runtime guards
-- Follow-up to raos_090, which was already applied to production before
-- Architect Round 5 completed. This migration tightens timestamp handling
-- without changing the RPC signatures used by the PWA/offlineSyncer.

create or replace function public.raos_attendance_check_in(
  p_lat numeric,
  p_lng numeric,
  p_selfie_url text,
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
  br record;
  server_now timestamptz := now();
  captured_at timestamptz;
  local_date date;
  scope_ids uuid[];
  geo record;
  overshoot numeric;
  is_valid boolean;
  roster_shift_id uuid;
  shift_row record;
  local_minutes int;
  start_min int;
  end_min int;
  status_val text;
  late_min int := 0;
  existing record;
  result_row public.raos_attendance%rowtype;
begin
  if caller is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  -- Online calls currently send device-now. Treat timestamps within 5 minutes
  -- of server time as online and replace them with server_now. Older timestamps
  -- are accepted only as bounded offline replay evidence. This preserves the
  -- existing offline queue without allowing arbitrary future/ancient backdating.
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
  if lower(coalesce(prof.role,'')) <> 'staff' then raise exception 'role_not_allowed'; end if;
  if prof.branch_id is null then raise exception 'branch_not_assigned'; end if;

  select id, coalesce(timezone,'Asia/Jakarta') as timezone
    into br from public.branches where id = prof.branch_id;
  if br.id is null then raise exception 'branch_not_found'; end if;

  local_date := (captured_at at time zone br.timezone)::date;

  select * into existing
    from public.raos_attendance
    where staff_id = caller and date = local_date
    for update;

  if existing.check_out_at is not null and captured_at > existing.check_out_at then
    raise exception 'checkin_after_checkout';
  end if;

  if existing.check_in_at is not null and existing.check_in_at >= captured_at then
    return jsonb_build_object('status','already_checked_in','row',to_jsonb(existing));
  end if;

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
    is_valid := false;
    overshoot := null;
  else
    overshoot := greatest(0, round(geo.dist_m) - geo.radius_meters);
    is_valid := overshoot <= 0;
  end if;

  if not prof.exempt and (overshoot is null or overshoot > 500) then
    raise exception 'geofence_blocked' using
      detail = coalesce('overshoot_m=' || overshoot::text, 'no_gps_or_no_pickup_point_in_scope');
  end if;

  select shift_id into roster_shift_id
    from public.raos_shift_schedules
    where staff_id = caller and branch_id = prof.branch_id and tanggal = local_date;

  if roster_shift_id is not null then
    select id, start_time, end_time, tolerance_minutes into shift_row
      from public.shifts where id = roster_shift_id and is_active = true;
  end if;

  if shift_row.id is null then
    local_minutes := extract(hour from captured_at at time zone br.timezone)::int * 60
                    + extract(minute from captured_at at time zone br.timezone)::int;
    select id, start_time, end_time, tolerance_minutes into shift_row
      from public.shifts
      where is_active = true
        and (
          (extract(hour from start_time)*60+extract(minute from start_time)::int <=
           extract(hour from end_time)*60+extract(minute from end_time)::int
           and local_minutes >= extract(hour from start_time)*60+extract(minute from start_time)::int
           and local_minutes < extract(hour from end_time)*60+extract(minute from end_time)::int)
          or
          (extract(hour from start_time)*60+extract(minute from start_time)::int >
           extract(hour from end_time)*60+extract(minute from end_time)::int
           and (local_minutes >= extract(hour from start_time)*60+extract(minute from start_time)::int
                or local_minutes < extract(hour from end_time)*60+extract(minute from end_time)::int))
        )
      order by start_time
      limit 1;
  end if;

  if shift_row.id is not null then
    start_min := extract(hour from shift_row.start_time)::int*60 + extract(minute from shift_row.start_time)::int;
    end_min := extract(hour from shift_row.end_time)::int*60 + extract(minute from shift_row.end_time)::int;
    local_minutes := extract(hour from captured_at at time zone br.timezone)::int * 60
                    + extract(minute from captured_at at time zone br.timezone)::int;
    if start_min > end_min and local_minutes < end_min then local_minutes := local_minutes + 1440; end if;
    if local_minutes > start_min + coalesce(shift_row.tolerance_minutes,0) then
      status_val := 'terlambat';
      late_min := local_minutes - start_min;
    else
      status_val := 'hadir';
    end if;
  else
    status_val := 'hadir';
  end if;

  insert into public.raos_attendance(
    staff_id, branch_id, date, shift_id, check_in_at,
    check_in_lat, check_in_lng, pickup_point_id, selfie_in_url,
    is_location_valid, status, late_minutes
  ) values (
    caller, prof.branch_id, local_date, shift_row.id, captured_at,
    p_lat, p_lng, geo.id, p_selfie_url,
    coalesce(is_valid,false), status_val, late_min
  )
  on conflict (staff_id, date) do update set
    branch_id = excluded.branch_id,
    shift_id = excluded.shift_id,
    check_in_at = excluded.check_in_at,
    check_in_lat = excluded.check_in_lat,
    check_in_lng = excluded.check_in_lng,
    pickup_point_id = excluded.pickup_point_id,
    selfie_in_url = excluded.selfie_in_url,
    is_location_valid = excluded.is_location_valid,
    status = excluded.status,
    late_minutes = excluded.late_minutes
  where public.raos_attendance.check_in_at is null
     or public.raos_attendance.check_in_at < excluded.check_in_at
  returning * into result_row;

  if result_row.staff_id is null then
    select * into result_row from public.raos_attendance where staff_id = caller and date = local_date;
  end if;

  return jsonb_build_object('status','checked_in','row',to_jsonb(result_row));
end;
$$;

revoke all on function public.raos_attendance_check_in(numeric,numeric,text,timestamptz) from public;
grant execute on function public.raos_attendance_check_in(numeric,numeric,text,timestamptz) to authenticated;

create or replace function public.raos_attendance_check_out(
  p_lat numeric,
  p_lng numeric,
  p_selfie_url text,
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
  br record;
  server_now timestamptz := now();
  captured_at timestamptz;
  local_date date;
  existing record;
  result_row public.raos_attendance%rowtype;
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

  select id, role, branch_id, is_active into prof
    from public.user_profiles where id = caller;
  if prof.id is null or not prof.is_active then raise exception 'profile_inactive'; end if;
  if lower(coalesce(prof.role,'')) <> 'staff' then raise exception 'role_not_allowed'; end if;
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

  update public.raos_attendance set
    check_out_at = captured_at,
    check_out_lat = p_lat,
    check_out_lng = p_lng,
    selfie_out_url = p_selfie_url
  where staff_id = caller and date = local_date
  returning * into result_row;

  return jsonb_build_object('status','checked_out','row',to_jsonb(result_row));
end;
$$;

revoke all on function public.raos_attendance_check_out(numeric,numeric,text,timestamptz) from public;
grant execute on function public.raos_attendance_check_out(numeric,numeric,text,timestamptz) to authenticated;

comment on function public.raos_attendance_check_in(numeric,numeric,text,timestamptz) is
  'RAOS 093: online-like timestamps are replaced by server time; offline captured timestamps are bounded to 24h and future timestamps are rejected. Server remains authoritative for identity/branch/geofence/shift/status.';
comment on function public.raos_attendance_check_out(numeric,numeric,text,timestamptz) is
  'RAOS 093: bounded offline replay, future timestamp rejection, and checkout-before-checkin guard.';
