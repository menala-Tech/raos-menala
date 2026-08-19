-- raos_105_koordinator_operational_parity — DRAFT, NOT APPLIED
-- Architect task (2026-08-20): KOORDINATOR = STAFF + BRANCH SUPERVISOR.
-- Koordinator must be able to perform the same personal KPI-generating
-- operational actions as Staff (own scan, own attendance, own isi saldo,
-- own history), on top of their existing branch supervisory rights.
--
-- ROOT CAUSE (confirmed via pg_get_functiondef against production,
-- 2026-08-20): apps/pwa/src/lib/accessPolicy.ts is a FRONTEND-ONLY gate.
-- Even after granting koordinator the `scan:create`/`attendance:self`/
-- `saldo:submit` capabilities there, the four canonical SECURITY DEFINER
-- RPCs koordinator would call all hard-gate on the caller's own role
-- server-side, independent of any client-side capability check:
--   raos_saldo_submit:          if lower(v_profile.role) <> 'staff' ...
--   raos_submit_scan:           if lower(coalesce(prof.role,'')) <> 'staff' ...
--   raos_attendance_check_in:   if lower(coalesce(prof.role,'')) <> 'staff' ...
--   raos_attendance_check_out:  if lower(coalesce(prof.role,'')) <> 'staff' ...
-- Fixing only the frontend would have left Koordinator's Isi Saldo/Scan/
-- Absensi buttons visible but non-functional (role_not_allowed from the
-- RPC). This migration is the actual authorization fix; accessPolicy.ts is
-- the accompanying (necessary but not sufficient) UI-visibility fix.
--
-- Also fixed: raos_order_kpi_snapshot() (used by /kpi for mode=order
-- branches) explicitly grouped koordinator with admin/management/direksi
-- into the branch-aggregate scope, so a Koordinator's own KPI page would
-- have shown branch totals, not personal target/realisasi -- contradicting
-- "Koordinator is a target-bearing person just like Staff" and "KPI Saya =
-- personal" from the business rule. Koordinator moves into the personal-
-- scope branch (same query shape as Staff); admin/management/direksi/
-- direktur remain the only branch-aggregate-scope roles. Branch monitoring
-- for Koordinator is unaffected -- it already lives in separate
-- supervisory surfaces (/riwayat-cabang, /validasi-saldo, etc.) gated by
-- history:branch:read / saldo:branch:read, not by this RPC.
--
-- Explicitly NOT touched by this migration (no evidence found requiring
-- it): raos_kpi_targets_staff RLS/write policy (admin/direksi/direktur-only
-- write is correct and unchanged -- Koordinator doesn't set its own target,
-- same as Staff), raos_hris_target_roster (Finance Target Staff canonical
-- roster already includes resolved_role IN ('staff','koordinator') --
-- confirmed via pg_get_viewdef, no change), raos_compute_payroll_month
-- (already treats role = ANY ('staff','koordinator') as target-bearing --
-- confirmed via pg_get_functiondef, no change), all RLS SELECT policies on
-- scan_orders/raos_attendance/raos_saldo_requests/raos_kpi_targets_staff
-- (already grant Koordinator both own-row access via staff_id=auth.uid()
-- paths inherited from admin/koord branch-scope policies, and branch-scope
-- read via is_branch_in_scope() -- confirmed via pg_policy, no change),
-- queue:operate (Panggil/Selesai antrian driver is a branch dispatch/
-- supervisory action, not a personal-KPI-generating one -- no evidence it
-- belongs in this parity fix, left as branch:read-only for Koordinator
-- exactly as before).

CREATE OR REPLACE FUNCTION public.raos_saldo_submit(p_client_id uuid, p_branch_id uuid, p_nominal numeric, p_room_id uuid, p_driver_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_profile public.user_profiles%rowtype;
  v_driver public.raos_drivers%rowtype;
  v_branch public.branches%rowtype;
  v_driver_branch public.branches%rowtype;
  v_room public.chat_rooms%rowtype;
  v_request public.raos_saldo_requests%rowtype;
  v_message_id uuid;
  v_request_no text;
  v_content jsonb;
  v_room_branch_id uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated: session Supabase wajib';
  end if;
  if p_client_id is null or p_branch_id is null or p_driver_id is null or p_nominal is null or p_nominal <= 0 then
    raise exception 'invalid_input: client_id, branch_id, driver_id, dan nominal positif wajib';
  end if;

  select * into v_profile
  from public.user_profiles
  where id=v_user_id and is_active=true;
  if not found then raise exception 'profile_not_found: profil aktif tidak ditemukan'; end if;

  -- Koordinator parity fix (2026-08-20): Koordinator = Staff + branch
  -- supervisor -- performs the same personal isi-saldo operational action
  -- as Staff, still scoped to their own branch by the check below.
  if lower(v_profile.role) not in ('staff','koordinator') then
    raise exception 'role_not_allowed: hanya Staff/Koordinator yang boleh mengajukan isi saldo';
  end if;
  if v_profile.branch_id is distinct from p_branch_id then
    raise exception 'branch_not_allowed: Staff/Koordinator hanya boleh submit untuk cabang sendiri';
  end if;

  select * into v_branch from public.branches where id=p_branch_id;
  if not found then raise exception 'branch_not_found: cabang tidak ditemukan'; end if;

  -- Nominal is server-authoritative per actual request branch/terminal.
  if jsonb_typeof(coalesce(v_branch.saldo_nominal_options,'[]'::jsonb)) <> 'array'
     or not exists (
       select 1
       from jsonb_array_elements(coalesce(v_branch.saldo_nominal_options,'[]'::jsonb)) as opt(value)
       where jsonb_typeof(opt.value)='number'
         and (opt.value::text)::numeric = p_nominal
     ) then
    raise exception 'invalid_nominal: nominal % tidak diizinkan untuk cabang %', p_nominal, p_branch_id;
  end if;

  v_room_branch_id := coalesce(v_branch.parent_branch_id,v_branch.id);

  select * into v_driver
  from public.raos_drivers
  where id=p_driver_id and is_active=true;
  if not found then raise exception 'driver_not_found: driver aktif tidak ditemukan'; end if;

  select * into v_driver_branch from public.branches where id=v_driver.branch_id;
  if v_driver.branch_id is null or not (
    v_driver.branch_id = v_branch.id
    or v_driver.branch_id = v_branch.parent_branch_id
    or v_driver_branch.parent_branch_id = v_branch.id
  ) then
    raise exception 'driver_branch_mismatch: driver tidak berada pada cabang/parent-child request';
  end if;

  -- A terminal keeps its own operational branch_id in the financial request,
  -- while chat delivery inherits the parent-airport Saldo room.
  select * into v_room
  from public.chat_rooms
  where branch_id=v_room_branch_id
    and is_active=true
    and (name ilike '%pengisian saldo%' or name ilike '%isi saldo%')
  order by created_at
  limit 1;

  if not found and p_room_id is not null then
    select * into v_room
    from public.chat_rooms
    where id=p_room_id
      and branch_id=v_room_branch_id
      and is_active=true
      and (name ilike '%pengisian saldo%' or name ilike '%isi saldo%');
  end if;
  if v_room.id is null then
    raise exception 'saldo_room_not_found: room saldo aktif untuk cabang/parent tidak ditemukan';
  end if;

  v_request_no := 'SLD-' || to_char(clock_timestamp(),'YYYYMMDD-HH24MISS-') ||
                  upper(substr(replace(p_client_id::text,'-',''),1,6));

  insert into public.raos_saldo_requests(
    request_no,client_id,staff_id,branch_id,nominal,status,
    chat_room_id,driver_id,driver_login_id,driver_name
  ) values (
    v_request_no,p_client_id,v_user_id,p_branch_id,p_nominal,'pending',
    v_room.id,v_driver.id,v_driver.driver_id,v_driver.name
  )
  on conflict (client_id) where client_id is not null do nothing
  returning * into v_request;

  if not found then
    select * into v_request from public.raos_saldo_requests where client_id=p_client_id;
    if not found or v_request.staff_id is distinct from v_user_id then
      raise exception 'idempotency_conflict: client_id dimiliki user lain';
    end if;
    return jsonb_build_object('status','already_exists','row',to_jsonb(v_request));
  end if;

  v_content := jsonb_build_object(
    'request_id',v_request.id,
    'request_no',v_request.request_no,
    'staff_name',v_profile.full_name,
    'branch_slug',v_branch.slug,
    'branch_name',v_branch.name,
    'branch_id',v_branch.id,
    'nominal',v_request.nominal,
    'status','pending',
    'requested_at',v_request.requested_at,
    'driver_login_id',v_driver.driver_id,
    'driver_name',v_driver.name,
    'driver_branch_name',(select b.name from public.branches b where b.id=v_driver.branch_id)
  );

  insert into public.chat_messages(room_id,sender_id,type,content,client_id)
  values(v_room.id,v_user_id,'saldo_request',v_content::text,p_client_id)
  returning id into v_message_id;

  update public.raos_saldo_requests
  set chat_message_id=v_message_id,updated_at=now()
  where id=v_request.id
  returning * into v_request;

  return jsonb_build_object('status','created','row',to_jsonb(v_request));
end $function$;


CREATE OR REPLACE FUNCTION public.raos_submit_scan(p_driver_ref text, p_lat numeric, p_lng numeric, p_client_scan_id text, p_client_captured_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Koordinator parity fix (2026-08-20): Koordinator = Staff + branch
  -- supervisor -- performs the same personal scan operational action as
  -- Staff, still scoped to their own branch's geofence scope below.
  if lower(coalesce(prof.role,'')) not in ('staff','koordinator') then raise exception 'role_not_allowed'; end if;
  if prof.branch_id is null then raise exception 'branch_not_assigned'; end if;

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
$function$;


CREATE OR REPLACE FUNCTION public.raos_attendance_check_in(p_lat numeric, p_lng numeric, p_selfie_url text, p_client_captured_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  caller uuid := auth.uid();
  prof record;
  br record;
  server_now timestamptz := now();
  captured_at timestamptz;
  local_date date;
  scope_ids uuid[];
  geo record;
  resolved_pickup_point_id uuid;
  overshoot numeric;
  is_valid boolean;
  roster_shift_id uuid;
  resolved_shift_id uuid;
  resolved_start_time time;
  resolved_end_time time;
  resolved_tolerance int;
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
  -- Koordinator parity fix (2026-08-20): Koordinator = Staff + branch
  -- supervisor -- performs the same personal attendance operational action
  -- as Staff, still scoped to their own branch's geofence scope below.
  if lower(coalesce(prof.role,'')) not in ('staff','koordinator') then raise exception 'role_not_allowed'; end if;
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
    resolved_pickup_point_id := null;
  else
    overshoot := greatest(0, round(geo.dist_m) - geo.radius_meters);
    is_valid := overshoot <= 0;
    select pp.id into resolved_pickup_point_id
      from public.pickup_points pp
      where pp.id = geo.id and pp.is_active = true;
  end if;

  if not prof.exempt and (overshoot is null or overshoot > 500) then
    raise exception 'geofence_blocked' using
      detail = coalesce('overshoot_m=' || overshoot::text, 'no_gps_or_no_pickup_point_in_scope');
  end if;

  select shift_id into roster_shift_id
    from public.raos_shift_schedules
    where staff_id = caller and branch_id = prof.branch_id and tanggal = local_date;

  if roster_shift_id is not null then
    select id, start_time, end_time, tolerance_minutes
      into resolved_shift_id, resolved_start_time, resolved_end_time, resolved_tolerance
      from public.shifts
      where id = roster_shift_id and is_active = true;
  end if;

  if resolved_shift_id is null then
    local_minutes := extract(hour from captured_at at time zone br.timezone)::int * 60
                    + extract(minute from captured_at at time zone br.timezone)::int;
    select id, start_time, end_time, tolerance_minutes
      into resolved_shift_id, resolved_start_time, resolved_end_time, resolved_tolerance
      from public.shifts
      where is_active = true
        and (
          (extract(hour from start_time)*60+extract(minute from start_time)::int <=
           extract(hour from end_time)*60+extract(minute from end_time)::int
           and local_minutes >= extract(hour from start_time)*60+extract(minute from start_time)::int
           and local_minutes <  extract(hour from end_time)*60+extract(minute from end_time)::int)
          or
          (extract(hour from start_time)*60+extract(minute from start_time)::int >
           extract(hour from end_time)*60+extract(minute from end_time)::int
           and (local_minutes >= extract(hour from start_time)*60+extract(minute from start_time)::int
                or local_minutes < extract(hour from end_time)*60+extract(minute from end_time)::int))
        )
      order by start_time
      limit 1;
  end if;

  if resolved_shift_id is not null then
    start_min := extract(hour from resolved_start_time)::int*60 + extract(minute from resolved_start_time)::int;
    end_min := extract(hour from resolved_end_time)::int*60 + extract(minute from resolved_end_time)::int;
    local_minutes := extract(hour from captured_at at time zone br.timezone)::int * 60
                    + extract(minute from captured_at at time zone br.timezone)::int;
    if start_min > end_min and local_minutes < end_min then local_minutes := local_minutes + 1440; end if;
    if local_minutes > start_min + coalesce(resolved_tolerance,0) then
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
    caller, prof.branch_id, local_date, resolved_shift_id, captured_at,
    p_lat, p_lng, resolved_pickup_point_id, p_selfie_url,
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
$function$;


CREATE OR REPLACE FUNCTION public.raos_attendance_check_out(p_lat numeric, p_lng numeric, p_selfie_url text, p_client_captured_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Koordinator parity fix (2026-08-20): mirrors raos_attendance_check_in.
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


CREATE OR REPLACE FUNCTION public.raos_order_kpi_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Koordinator parity fix (2026-08-20): Koordinator is a target-bearing
  -- person just like Staff for personal KPI purposes ("KPI Saya = personal";
  -- branch monitoring is a separate supervisory surface, not this RPC).
  -- Previously grouped with admin/management/direksi/direktur into the
  -- branch-aggregate scope below, which would have made a Koordinator's own
  -- /kpi page always show branch totals instead of their own target/
  -- realisasi.
  if lower(coalesce(prof.role,'')) in ('staff','koordinator') then
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
  elsif lower(coalesce(prof.role,'')) in ('admin','management','direksi','direktur') then
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
$function$;
