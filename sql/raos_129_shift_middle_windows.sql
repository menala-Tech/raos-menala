-- RAOS 129 (NOT YET APPLIED — pending owner final gate) — canonical Middle (MI) window-based shift
-- 2026-08-26 · post-field-UAT Item 4
--
-- OWNER CONTRACT
--   P  = Pagi   (unchanged)
--   MI = Middle (NEW)  check-in 10:00-12:00 · check-out 19:00-23:00
--   S  = Siang  (unchanged)
--   M  = Malam  (unchanged)
--   -  = Libur
--
-- WHY NEW COLUMNS (audit result — do NOT overload start_time/end_time)
--   The attendance engine today interprets shifts.start_time as the single
--   on-time reference and end_time only for (a) roster-less shift auto-detect
--   containment and (b) overnight wrap detection. tolerance_minutes is honoured
--   by raos_attendance_check_in (status hadir/terlambat) and by the GAS archive,
--   but the authoritative payroll trigger raos_attendance_compute_late
--   (sql/raos_097) measures late_minutes = local check-in - start_time and
--   IGNORES tolerance_minutes entirely. There is NO check-out time validation
--   anywhere (raos_109 validates only ordering + geofence), and no engine can
--   express "check-in window close" or "check-out window".
--   Consequence: modelling Middle as start_time 10:00 / tolerance 120 would make
--   an in-window 11:15 check-in bill 75 late minutes => Rp 30.000 deduction.
--   That is a payroll change, which is forbidden. Hence explicit window columns,
--   NULL for Pagi/Siang/Malam so their behaviour and payroll stay bit-identical.
--
-- OWNER-CONFIRMED 2026-08-26: check-in before 10:00 is rejected; check-in
--   after 12:00 is recorded as 'terlambat' with late measured from 12:00.
--   Check-out before 19:00 is rejected; check-out after 23:00 is recorded
--   (not rejected) to preserve the attendance row and avoid forced auto-checkout.

begin;

-- ---------- 1. Schema: nullable attendance windows -------------------------
alter table public.shifts
  add column if not exists check_in_start  time,
  add column if not exists check_in_end    time,
  add column if not exists check_out_start time,
  add column if not exists check_out_end   time;

comment on column public.shifts.check_in_start  is 'Window-based shift only. Earliest valid check-in (branch-local). NULL = legacy start_time behaviour.';
comment on column public.shifts.check_in_end    is 'Window-based shift only. Latest on-time check-in; also the late/payroll reference. NULL = legacy start_time.';
comment on column public.shifts.check_out_start is 'Window-based shift only. Earliest valid check-out. NULL = no check-out window enforcement (legacy).';
comment on column public.shifts.check_out_end   is 'Window-based shift only. Latest on-time check-out. NULL = no check-out window enforcement (legacy).';

alter table public.shifts
  drop constraint if exists shifts_attendance_windows_same_day;
alter table public.shifts
  add constraint shifts_attendance_windows_same_day check (
    (check_in_start is null) = (check_in_end is null)
    and (check_out_start is null) = (check_out_end is null)
    and (check_in_start is null or check_in_start < check_in_end)
    and (check_out_start is null or check_out_start < check_out_end)
    and (check_in_end is null or check_out_start is null or check_in_end <= check_out_start)
  );

-- ---------- 2. Canonical Middle row --------------------------------------
-- Pagi 5a335fe8-6864-49c1-9c2c-d7753f21e859, Siang 5098582e-6015-4de5-86fc-4b330e8aa02c,
-- Malam 45b7af1e-2a6b-4d6b-92b5-d1ef9b2d58aa are NOT touched by this migration.
-- start_time/end_time are the operational span (display + legacy readers);
-- tolerance_minutes 120 keeps the legacy GAS archive late boundary at 12:00,
-- identical to check_in_end.
insert into public.shifts (
  name, start_time, end_time, tolerance_minutes, is_active,
  check_in_start, check_in_end, check_out_start, check_out_end
)
select 'Middle', '10:00'::time, '23:00'::time, 120, true,
       '10:00'::time, '12:00'::time, '19:00'::time, '23:00'::time
where not exists (
  select 1 from public.shifts where lower(trim(name)) = 'middle'
);

-- ---------- 3. Payroll trigger: window-aware late reference ---------------
-- Legacy rows (check_in_end NULL) fall through to start_time => arithmetic and
-- late_deduction_idr are unchanged for Pagi/Siang/Malam.
create or replace function public.raos_attendance_compute_late()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift_start time;
  v_shift_end time;
  v_check_in_end time;
  v_late_ref time;
  v_rate numeric := 10000;
  v_interval int := 30;
  v_check_in timestamptz;
  v_timezone text := 'Asia/Jakarta';
  v_local_time time;
  v_diff_minutes int := 0;
begin
  v_check_in := coalesce(new.check_in_at_override, new.check_in_at);
  if v_check_in is null or new.shift_id is null then
    new.late_minutes := 0;
    new.late_deduction_idr := 0;
    return new;
  end if;

  select s.start_time, s.end_time, s.check_in_end
    into v_shift_start, v_shift_end, v_check_in_end
    from public.shifts s
    where s.id = new.shift_id;

  if v_shift_start is null then
    new.late_minutes := 0;
    new.late_deduction_idr := 0;
    return new;
  end if;

  v_late_ref := coalesce(v_check_in_end, v_shift_start);

  select coalesce(b.timezone,'Asia/Jakarta')
    into v_timezone
    from public.branches b
    where b.id = new.branch_id;

  v_timezone := coalesce(v_timezone, 'Asia/Jakarta');
  v_local_time := (v_check_in at time zone v_timezone)::time;

  if v_shift_end is not null and v_shift_start > v_shift_end and v_local_time < v_shift_end then
    v_diff_minutes := ((extract(epoch from v_local_time)::int + 86400) - extract(epoch from v_late_ref)::int) / 60;
  else
    v_diff_minutes := (extract(epoch from v_local_time)::int - extract(epoch from v_late_ref)::int) / 60;
  end if;

  new.late_minutes := greatest(0, v_diff_minutes);

  select coalesce((select value::numeric from public.system_config where key='LATE_DEDUCTION_RATE_IDR'), 10000)
    into v_rate;
  select coalesce((select value::int from public.system_config where key='LATE_DEDUCTION_INTERVAL_MIN'), 30)
    into v_interval;

  new.late_deduction_idr := ceil(new.late_minutes::numeric / v_interval) * v_rate;
  return new;
end;
$$;

-- ---------- 4. Check-in: window guard + roster-only window shifts ---------
-- Based on sql/raos_105 (current production definition). Deltas are marked
-- "-- 129:".
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
  resolved_ci_start time;   -- 129
  resolved_ci_end time;     -- 129
  ci_start_min int;         -- 129
  ci_end_min int;           -- 129
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
    select id, start_time, end_time, tolerance_minutes, check_in_start, check_in_end
      into resolved_shift_id, resolved_start_time, resolved_end_time, resolved_tolerance,
           resolved_ci_start, resolved_ci_end
      from public.shifts
      where id = roster_shift_id and is_active = true;
  end if;

  if resolved_shift_id is null then
    local_minutes := extract(hour from captured_at at time zone br.timezone)::int * 60
                    + extract(minute from captured_at at time zone br.timezone)::int;
    -- 129: window-based shifts (Middle) are roster-only. Excluding them here
    -- keeps roster-less auto-detect for Pagi/Siang/Malam exactly as before —
    -- Middle's 10:00-23:00 span would otherwise shadow Siang and Malam.
    select id, start_time, end_time, tolerance_minutes, check_in_start, check_in_end
      into resolved_shift_id, resolved_start_time, resolved_end_time, resolved_tolerance,
           resolved_ci_start, resolved_ci_end
      from public.shifts
      where is_active = true
        and check_in_start is null   -- 129
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

    if resolved_ci_end is not null then
      -- 129: window-based shift (Middle). Same-day windows only (constraint).
      ci_start_min := extract(hour from resolved_ci_start)::int*60 + extract(minute from resolved_ci_start)::int;
      ci_end_min := extract(hour from resolved_ci_end)::int*60 + extract(minute from resolved_ci_end)::int;
      if local_minutes < ci_start_min then
        raise exception 'checkin_before_window' using
          detail = 'window=' || to_char(resolved_ci_start,'HH24:MI') || '-' || to_char(resolved_ci_end,'HH24:MI');
      end if;
      if local_minutes > ci_end_min then
        -- Owner-confirmed: record after 12:00 as 'terlambat', measured from 12:00.
        status_val := 'terlambat';
        late_min := local_minutes - ci_end_min;
      else
        status_val := 'hadir';
      end if;
    elsif local_minutes > start_min + coalesce(resolved_tolerance,0) then
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

revoke all on function public.raos_attendance_check_in(numeric,numeric,text,timestamptz) from public, anon;
grant execute on function public.raos_attendance_check_in(numeric,numeric,text,timestamptz) to authenticated;

-- ---------- 5. Check-out: window guard -----------------------------------
-- Based on sql/raos_109 (current production definition). Deltas marked "-- 129:".
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
  shift_row record;   -- 129
  local_minutes int;  -- 129
  co_start_min int;   -- 129
  co_end_min int;     -- 129
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

  -- 129: check-out window enforcement for window-based shifts only.
  -- Legacy shifts have check_out_start NULL => no behaviour change.
  if existing.shift_id is not null then
    select check_out_start, check_out_end into shift_row
      from public.shifts where id = existing.shift_id;
    if shift_row.check_out_start is not null then
      local_minutes := extract(hour from captured_at at time zone br.timezone)::int * 60
                      + extract(minute from captured_at at time zone br.timezone)::int;
      co_start_min := extract(hour from shift_row.check_out_start)::int*60 + extract(minute from shift_row.check_out_start)::int;
      co_end_min := extract(hour from shift_row.check_out_end)::int*60 + extract(minute from shift_row.check_out_end)::int;
      if local_minutes < co_start_min then
        raise exception 'checkout_before_window' using
          detail = 'window=' || to_char(shift_row.check_out_start,'HH24:MI') || '-' || to_char(shift_row.check_out_end,'HH24:MI');
      end if;
      -- Owner-confirmed: record after 23:00; do not reject or force auto-checkout.
    end if;
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

commit;

-- ---------- VERIFICATION (run after apply, QA first) ----------------------
-- select name, start_time, end_time, tolerance_minutes,
--        check_in_start, check_in_end, check_out_start, check_out_end
--   from public.shifts where is_active order by start_time;
-- Expect Pagi/Siang/Malam window columns all NULL and their
-- start_time/end_time/tolerance_minutes byte-identical to before.
