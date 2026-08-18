-- =====================================================================
-- DRAFT MIGRATION — NOT APPLIED TO PRODUCTION
-- B10 (canonical scan submission RPC) — DRAFT ONLY, review before wiring
-- any frontend. Do NOT wire apps/pwa/src/app/scan/page.tsx or
-- offlineSyncer.ts to this until this file has been reviewed/approved.
-- =====================================================================
-- Root problem (confirmed via live schema read, vlievtojpmrbsmzlqswl,
-- 2026-08-19): apps/pwa/src/app/scan/page.tsx does a direct
-- `.from('scan_orders').insert(payload)` with staff_id/status client-set
-- (status is currently always 'pending' from the client, but nothing
-- server-side stops a modified client from sending something else).
-- driver_id is resolved client-side from a barcode/driver_id lookup
-- against raos_drivers with no branch-scope check against the caller's
-- own branch (a staff member could scan a driver barcode belonging to a
-- different branch's driver and the row would still insert).
--
-- This migration reuses raos_branch_geofence_scope(uuid) from
-- sql/raos_090_attendance_canonical_rpc_DRAFT.sql (same B9 resolver --
-- do not duplicate the SOETA/T1/T2/T3 rule a third time). If that
-- migration is not applied first, this one will fail at CREATE FUNCTION
-- time (the function body references it) -- apply 090 before 092.
-- =====================================================================

create or replace function public.raos_submit_scan(
  p_driver_ref text,          -- barcode OR raos_drivers.driver_id text, evidence only
  p_lat numeric,
  p_lng numeric,
  p_client_scan_id text,      -- client-generated idempotency key (offline-safe)
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
  scope_ids uuid[];
  drv record;
  geo record;
  overshoot numeric;
  existing record;
  result_row public.scan_orders%rowtype;
  scan_id_val text;
begin
  if caller is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if p_driver_ref is null or btrim(p_driver_ref) = '' then
    raise exception 'invalid_input' using detail = 'driver_ref_required';
  end if;
  if p_client_scan_id is null or btrim(p_client_scan_id) = '' then
    raise exception 'invalid_input' using detail = 'client_scan_id_required';
  end if;

  select id, role, branch_id, is_active, coalesce(is_geofence_exempt,false) as exempt
    into prof
    from public.user_profiles
    where id = caller;
  if prof.id is null or not prof.is_active then
    raise exception 'profile_inactive';
  end if;
  if lower(coalesce(prof.role,'')) <> 'staff' then
    -- Matches /scan's actual reachable audience (ROLE_ROUTES.staff, B1) --
    -- koordinator/admin/direksi never submit a scan themselves through
    -- this page; validation is a separate action (validateScan(), B12)
    -- against admin_id/koordinator_id, untouched by this RPC.
    raise exception 'role_not_allowed';
  end if;
  if prof.branch_id is null then
    raise exception 'branch_not_assigned';
  end if;

  -- Idempotency: a client_scan_id we've already recorded (via the
  -- client_scan_id-derived scan_id, see below) is a no-op replay, not an
  -- error -- same pattern as offlineSyncer's existing scan_orders.scan_id
  -- pre-check, just made race-free under a row lock here.
  scan_id_val := 'SCN-' || p_client_scan_id;
  select * into existing from public.scan_orders where scan_id = scan_id_val for update;
  if existing.id is not null then
    return jsonb_build_object('status','already_submitted','row',to_jsonb(existing));
  end if;

  select coalesce(timezone,'Asia/Jakarta') as timezone into br
    from public.branches where id = prof.branch_id;

  -- B9 canonical scope, shared with attendance -- same rule, not
  -- reimplemented: SOETA parent -> SOETA+T1+T2+T3; a terminal or any
  -- other branch -> itself only.
  scope_ids := public.raos_branch_geofence_scope(prof.branch_id);

  -- Driver must be active AND within the caller's canonical branch scope
  -- -- this is the part the current client-side lookup does not enforce
  -- at all (any active driver matches, any branch).
  select * into drv
    from public.raos_drivers
    where (barcode = p_driver_ref or driver_id = p_driver_ref)
      and is_active = true
      and branch_id = any(scope_ids)
    limit 1;
  if drv.id is null then
    raise exception 'driver_not_found_in_scope';
  end if;

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
    overshoot := null;
  else
    overshoot := greatest(0, round(geo.dist_m) - geo.radius_meters);
  end if;

  -- Same hard-block rule as attendance (B2): staff only (guaranteed
  -- above), non-exempt, outside 500m tolerance. Mirrors lib/geo.ts
  -- GEOFENCE_TOLERANCE_METERS -- see the same follow-up note in
  -- raos_090 about making this SYSTEM CONFIG-driven later.
  if not prof.exempt and (overshoot is null or overshoot > 500) then
    raise exception 'geofence_blocked' using
      detail = coalesce('overshoot_m=' || overshoot::text, 'no_gps_or_no_pickup_point_in_scope');
  end if;

  -- Everything the browser cannot set, by construction: staff_id (from
  -- auth.uid()), status (always 'pending' -- validation is a separate
  -- action), koordinator_id/admin_id/validated_at/admin_checked* (all
  -- NULL/false at submission, exactly like the current client behavior,
  -- just no longer trusting the client to leave them alone), gmv/
  -- incentive (canonical DB defaults, computed later by the existing
  -- admin/GAS pipeline -- unchanged).
  insert into public.scan_orders(
    scan_id, driver_id, staff_id, pickup_point_id, scanned_at,
    latitude, longitude, status
  ) values (
    scan_id_val, drv.id, caller, geo.id, captured_at,
    p_lat, p_lng, 'pending'
  )
  returning * into result_row;

  return jsonb_build_object('status','submitted','row',to_jsonb(result_row));
end;
$$;

comment on function public.raos_submit_scan(text,numeric,numeric,text,timestamptz) is
  'B10 DRAFT canonical scan submission. Server-derives staff_id/branch-scope/pickup_point_id/status from auth.uid() + evidence; browser supplies only driver_ref (barcode/driver_id text)/lat/lng/client_scan_id. Driver must be active AND within the caller''s B9 branch scope (not just active anywhere). Idempotent on client_scan_id. koordinator_id/admin_id/validated_at left NULL -- validateScan() (B12) remains the only writer for those.';

revoke all on function public.raos_submit_scan(text,numeric,numeric,text,timestamptz) from public;
grant execute on function public.raos_submit_scan(text,numeric,numeric,text,timestamptz) to authenticated;

-- ---------------------------------------------------------------------
-- Follow-up notes (not executed by this migration)
-- ---------------------------------------------------------------------
-- - Depends on raos_branch_geofence_scope(uuid) from
--   sql/raos_090_attendance_canonical_rpc_DRAFT.sql -- apply that one
--   first if these ever get applied together.
-- - NOT done here (deliberately, to keep this draft narrow): wiring
--   apps/pwa/src/app/scan/page.tsx or offlineSyncer.ts's 'scan_order'
--   replay to this RPC. Per instruction, frontend wiring waits for this
--   draft to be reviewed first.
-- - Existing scan_orders RLS policies are untouched by this migration,
--   same rollback-safety reasoning as raos_090's note: once this RPC
--   ships and the frontend is confirmed using it exclusively, a
--   follow-up migration should tighten direct staff INSERT.
