-- =====================================================================
-- DRAFT MIGRATION — NOT APPLIED TO PRODUCTION
-- B2 (attendance server-authoritative mutation) + B9 (SOETA parent
-- geofence scope resolver, shared with future scan RPC per B10)
-- =====================================================================
-- Root problem (confirmed via live schema/RLS/RPC read on
-- vlievtojpmrbsmzlqswl, 2026-08-19):
--   - RLS on raos_attendance (raos_attendance_staff_insert /
--     _staff_update_today) already restricts INSERT/UPDATE to the
--     caller's own row, own branch, today's date -- but does NOT
--     validate that check_in_lat/lng are actually inside a pickup
--     point radius. Geofence enforcement today is 100% client-side
--     (lib/geo.ts shouldBlockByGeofence / checkGeofence): a staff
--     browser can submit any lat/lng and any is_location_valid value
--     and RLS will accept it as long as staff_id/branch_id/date match.
--   - checkGeofence() filters raos_geofence_points by branchId
--     *exactly*, so a SOETA-parent-assigned staff member never sees
--     T1/T2/T3 pickup points (B9), while each terminal correctly only
--     sees its own.
--
-- This migration adds:
--   1. raos_branch_geofence_scope(uuid) -- canonical branch-scope
--      resolver (SOETA parent -> SOETA+T1+T2+T3, terminal -> itself,
--      any other branch -> itself). Meant to be reused by this RPC and
--      by the future scan RPC (B10) and by client display -- single
--      source of the scope rule instead of three separate copies.
--   2. raos_attendance_check_in(...) / raos_attendance_check_out(...)
--      -- SECURITY DEFINER RPCs that make the server the sole authority
--      for staff_id, branch_id, date, pickup_point_id, geofence
--      validity, shift assignment, late status, and the hard-block
--      decision. Ported 1:1 from the existing client logic (lib/geo.ts
--      shouldBlockByGeofence/checkGeofence, lib/shift.ts isLate) so
--      behavior does not change for a staff member standing where the
--      app already said they could check in -- only WHO gets to decide
--      moves from browser to server.
--
-- NOT covered here (left for a later, narrower migration once this one
-- is reviewed): koordinator/admin manual attendance edit RPC (existing
-- `raos_attendance_admin_insert`/manual_edited_by columns untouched),
-- reminder-shift audience (B14, reads this same shift-schedule table,
-- no schema change needed).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Canonical branch-scope resolver (B9)
-- ---------------------------------------------------------------------
create or replace function public.raos_branch_geofence_scope(p_branch_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- SOETA parent hub: own point + all 3 terminals' points.
    when exists (
      select 1 from public.branches b
      where b.id = p_branch_id and b.branch_type = 'airport_hub'
    ) then (
      select array_agg(id) from (
        select p_branch_id as id
        union all
        select id from public.branches where parent_branch_id = p_branch_id
      ) x
    )
    -- Anything else (a terminal T1/T2/T3, or any standalone branch):
    -- exactly its own branch, never siblings or parent.
    else array[p_branch_id]
  end
$$;

comment on function public.raos_branch_geofence_scope(uuid) is
  'B9 canonical geofence branch scope: SOETA parent (branch_type=airport_hub) resolves to itself + its terminal children (T1/T2/T3); every other branch (including each terminal individually) resolves to only itself. Single source of truth for attendance + future scan RPC + client display -- do not reimplement this rule elsewhere.';

revoke all on function public.raos_branch_geofence_scope(uuid) from public;
grant execute on function public.raos_branch_geofence_scope(uuid) to authenticated;
-- Intentionally NOT granted to anon: scope resolution is only meaningful
-- for an authenticated caller's own branch context.

-- ---------------------------------------------------------------------
-- 2. raos_attendance_check_in
-- ---------------------------------------------------------------------
-- Params are EVIDENCE only (what the device observed), never identity or
-- outcome:
--   p_lat/p_lng          -- GPS fix at time of check-in (nullable: GPS
--                           unavailable is itself a hard-block condition
--                           for non-exempt staff, same as today).
--   p_selfie_url          -- storage path, already uploaded by the client
--                           (or by offlineSyncer during replay) before
--                           calling this RPC -- unchanged from today.
--   p_client_captured_at  -- ONLY used for offline replay: the timestamp
--                           the action actually happened on-device. Null
--                           for the normal online path (server uses
--                           now()). This is what lets a replay bucket
--                           into the correct branch-local attendance
--                           date even if the sync happens after midnight,
--                           and lets the RPC refuse to clobber a newer
--                           row with a stale offline payload.
-- Everything else (staff_id, branch_id, date, pickup_point_id, shift_id,
-- status, is_location_valid) is derived server-side from auth.uid() and
-- the evidence above -- the browser cannot set any of them directly.
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
  captured_at timestamptz := coalesce(p_client_captured_at, now());
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

  select id, role, branch_id, is_active, coalesce(is_geofence_exempt,false) as exempt
    into prof
    from public.user_profiles
    where id = caller;

  if prof.id is null or not prof.is_active then
    raise exception 'profile_inactive';
  end if;
  if lower(coalesce(prof.role,'')) <> 'staff' then
    -- Matches the existing raos_attendance_staff_insert RLS scope exactly:
    -- only 'staff' self-checks-in through /absensi. Koordinator/admin/
    -- direksi never reach this page (ROLE_ROUTES, B1) and manual edits go
    -- through the separate admin-insert path, untouched by this RPC.
    raise exception 'role_not_allowed';
  end if;
  if prof.branch_id is null then
    raise exception 'branch_not_assigned';
  end if;

  select id, coalesce(timezone,'Asia/Jakarta') as timezone
    into br
    from public.branches
    where id = prof.branch_id;
  if br.id is null then
    raise exception 'branch_not_found';
  end if;

  local_date := (captured_at at time zone br.timezone)::date;

  -- Row lock: serializes concurrent/replayed check-ins for the same
  -- staff+date so the "don't clobber newer with stale offline replay"
  -- check below is race-free (mirrors offlineSyncer's existing intent,
  -- now enforced under a lock instead of a client-side read-then-write).
  select * into existing
    from public.raos_attendance
    where staff_id = caller and date = local_date
    for update;

  if existing.check_in_at is not null and existing.check_in_at >= captured_at then
    -- Idempotent replay-safe: an equal-or-newer check-in already exists.
    return jsonb_build_object('status','already_checked_in','row',to_jsonb(existing));
  end if;

  -- B9 canonical scope (SOETA parent sees T1/T2/T3; a terminal sees only
  -- itself; every other branch sees only itself).
  scope_ids := public.raos_branch_geofence_scope(prof.branch_id);

  if p_lat is not null and p_lng is not null then
    select gp.id, gp.name, gp.radius_meters,
      ( 6371000 * 2 * asin( sqrt(
          power(sin(radians((gp.latitude - p_lat)/2)), 2) +
          cos(radians(p_lat)) * cos(radians(gp.latitude)) *
          power(sin(radians((gp.longitude - p_lng)/2)), 2)
        ) )
      ) as dist_m
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

  -- Hard block: staff only (already guaranteed above), non-exempt, and
  -- either no usable location/pickup-point data or genuinely outside
  -- tolerance. 500 mirrors lib/geo.ts GEOFENCE_TOLERANCE_METERS -- if
  -- that constant ever changes, update it here too (see SYSTEM CONFIG
  -- follow-up note at the bottom of this file).
  if not prof.exempt and (overshoot is null or overshoot > 500) then
    raise exception 'geofence_blocked' using
      detail = coalesce('overshoot_m=' || overshoot::text, 'no_gps_or_no_pickup_point_in_scope');
  end if;

  -- B13: today's roster is authoritative; detectCurrentShift()-equivalent
  -- fallback only when no roster row exists for this staff+branch+date.
  select shift_id into roster_shift_id
    from public.raos_shift_schedules
    where staff_id = caller and branch_id = prof.branch_id and tanggal = local_date;

  if roster_shift_id is not null then
    select id, start_time, end_time, tolerance_minutes into shift_row
      from public.shifts where id = roster_shift_id and is_active = true;
  end if;

  if shift_row.id is null then
    -- Fallback: same "which shift window contains local time-of-day" scan
    -- lib/shift.ts detectCurrentShift() does client-side.
    local_minutes := extract(hour from captured_at at time zone br.timezone)::int * 60
                    + extract(minute from captured_at at time zone br.timezone)::int;
    select id, start_time, end_time, tolerance_minutes into shift_row
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

  if shift_row.id is not null then
    start_min := extract(hour from shift_row.start_time)::int*60 + extract(minute from shift_row.start_time)::int;
    end_min   := extract(hour from shift_row.end_time)::int*60 + extract(minute from shift_row.end_time)::int;
    local_minutes := extract(hour from captured_at at time zone br.timezone)::int * 60
                    + extract(minute from captured_at at time zone br.timezone)::int;
    if start_min > end_min and local_minutes < end_min then
      local_minutes := local_minutes + 1440; -- overnight shift wraparound, matches lib/shift.ts isLate()
    end if;
    if local_minutes > start_min + coalesce(shift_row.tolerance_minutes,0) then
      status_val := 'terlambat';
      late_min := local_minutes - start_min;
    else
      status_val := 'hadir';
    end if;
  else
    status_val := 'hadir'; -- no shift configured at all -- unchanged from current client default
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
    -- ON CONFLICT ... WHERE guard skipped the write (existing row already
    -- newer) -- return the current row as the idempotent result instead of
    -- an empty one.
    select * into result_row from public.raos_attendance where staff_id = caller and date = local_date;
  end if;

  return jsonb_build_object('status','checked_in','row',to_jsonb(result_row));
end;
$$;

comment on function public.raos_attendance_check_in(numeric,numeric,text,timestamptz) is
  'B2 canonical check-in. Server-derives staff_id/branch_id/date/pickup_point_id/shift_id/status/is_location_valid from auth.uid() + evidence params; browser cannot set any identity/outcome field directly. Geofence hard-block enforced server-side (mirrors lib/geo.ts client copy, which becomes UX-only after this ships). Idempotent: replay with an equal-or-older captured_at is a no-op.';

revoke all on function public.raos_attendance_check_in(numeric,numeric,text,timestamptz) from public;
grant execute on function public.raos_attendance_check_in(numeric,numeric,text,timestamptz) to authenticated;

-- ---------------------------------------------------------------------
-- 3. raos_attendance_check_out
-- ---------------------------------------------------------------------
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
  captured_at timestamptz := coalesce(p_client_captured_at, now());
  local_date date;
  existing record;
  result_row public.raos_attendance%rowtype;
begin
  if caller is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  select id, role, branch_id, is_active
    into prof
    from public.user_profiles
    where id = caller;
  if prof.id is null or not prof.is_active then
    raise exception 'profile_inactive';
  end if;
  if lower(coalesce(prof.role,'')) <> 'staff' then
    raise exception 'role_not_allowed';
  end if;
  if prof.branch_id is null then
    raise exception 'branch_not_assigned';
  end if;

  select coalesce(timezone,'Asia/Jakarta') as timezone into br
    from public.branches where id = prof.branch_id;
  local_date := (captured_at at time zone coalesce(br.timezone,'Asia/Jakarta'))::date;

  select * into existing
    from public.raos_attendance
    where staff_id = caller and date = local_date
    for update;

  if existing.staff_id is null or existing.check_in_at is null then
    raise exception 'not_checked_in';
  end if;

  if existing.check_out_at is not null and existing.check_out_at >= captured_at then
    -- Idempotent replay-safe: an equal-or-newer check-out already exists.
    return jsonb_build_object('status','already_checked_out','row',to_jsonb(existing));
  end if;

  -- Note (deliberate, matches current behavior): check-out does not
  -- re-run the geofence hard-block. The existing client (absensi/page.tsx)
  -- shows the same operationalGate reason banner for both actions but has
  -- never actually blocked the check-out button on geofence -- only the
  -- check-in path is gated by shouldBlockByGeofence in practice, since
  -- hasCheckedIn must already be true to reach check-out. Recording
  -- is_location_valid/geofence distance on check-out is left as a
  -- follow-up if a future audit wants an explicit exit hard-block too.
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

comment on function public.raos_attendance_check_out(numeric,numeric,text,timestamptz) is
  'B2 canonical check-out. Server-derives staff_id/date from auth.uid(); browser cannot target another staff row. Idempotent: replay with an equal-or-older captured_at is a no-op.';

revoke all on function public.raos_attendance_check_out(numeric,numeric,text,timestamptz) from public;
grant execute on function public.raos_attendance_check_out(numeric,numeric,text,timestamptz) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Follow-up notes (not executed by this migration)
-- ---------------------------------------------------------------------
-- - The 500m tolerance is hardcoded to match lib/geo.ts's
--   GEOFENCE_TOLERANCE_METERS constant at the time this draft was
--   written. If that ever needs to be admin-configurable, wire it through
--   SYSTEM CONFIG (GEOFENCE_TOLERANCE_METER, already read client-side via
--   useSystemConfigNumber) and pass it into these RPCs instead of the
--   literal 500 -- deferred here to keep this migration's blast radius
--   limited to "move validation server-side", not "add new config".
-- - This migration does NOT touch the existing RLS policies on
--   raos_attendance (raos_attendance_staff_insert/_update_today/etc).
--   Once this RPC ships and the frontend is confirmed using it
--   exclusively, a FOLLOW-UP migration should tighten
--   raos_attendance_staff_insert/_staff_update_today to deny direct
--   staff INSERT/UPDATE entirely (RPC is SECURITY DEFINER so it does not
--   need the staff RLS grant to write) -- deliberately NOT done in this
--   same migration so the old direct-write path stays available as a
--   rollback safety net for one deploy cycle.
