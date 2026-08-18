-- =====================================================================
-- DRAFT MIGRATION — NOT APPLIED TO PRODUCTION
-- B4 (driver self-join queue)
-- =====================================================================
-- Root problem (confirmed via live pg_proc/pg_columns read,
-- vlievtojpmrbsmzlqswl, 2026-08-19):
--   raos_join_queue(p_driver_id uuid, p_branch_id uuid, p_room_id uuid)
--   explicitly rejects role='driver' (`r not in
--   ('staff','admin','direksi','direktur','driver_manager') -> role_not_
--   allowed`), and even if it didn't, its signature lets ANY caller pass
--   an arbitrary p_driver_id -- fine for staff/koordinator queueing a
--   driver on someone else's behalf, wrong for a driver self-request
--   (a driver must never be able to queue a different driver).
--
--   user_profiles.driver_id (uuid, FK-shaped, confirmed present) is the
--   existing link from an authenticated driver's own profile to their
--   raos_drivers row -- this is what lets the server resolve "which
--   driver is this" without trusting anything the browser sends.
--
-- This migration adds a narrow, driver-only RPC. It does NOT touch
-- raos_join_queue (still used by staff/koordinator/admin/driver_manager
-- exactly as today) and does NOT grant role=driver execute on it.
-- =====================================================================

create or replace function public.raos_driver_self_join_queue(p_room_id uuid default null)
returns table(queue_id uuid, queue_pos integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  prof record;
  v_driver public.raos_drivers%rowtype;
  v_branch public.branches%rowtype;
  v_pos integer;
  v_id uuid;
begin
  if caller is null then
    raise exception 'unauthenticated';
  end if;

  select id, role, is_active, driver_id into prof
    from public.user_profiles
    where id = caller;

  if prof.id is null or not prof.is_active then
    raise exception 'profile_inactive';
  end if;
  -- Exact role match, not a broader set -- this RPC exists specifically
  -- so a driver never needs (and never gets) access to the generic
  -- raos_join_queue, which staff/admin/koordinator/driver_manager keep
  -- using unchanged.
  if lower(coalesce(prof.role,'')) <> 'driver' then
    raise exception 'role_not_allowed';
  end if;
  if prof.driver_id is null then
    -- Profile exists and is role=driver but has never been linked to a
    -- raos_drivers row (SSoT sync gap) -- fail closed rather than guess.
    raise exception 'driver_profile_not_linked';
  end if;

  -- Server resolves the driver row from the profile link -- the caller
  -- never supplies driver_id, so there is no parameter to falsify.
  select * into v_driver from public.raos_drivers
    where id = prof.driver_id and is_active = true
    for update;
  if not found then
    raise exception 'driver_not_found_or_inactive';
  end if;

  -- Server resolves branch from the driver row too (never from the
  -- caller) -- reuses the exact same scope guard raos_join_queue uses.
  if not public.is_branch_in_scope(v_driver.branch_id) then
    raise exception 'branch_not_in_scope';
  end if;
  select * into v_branch from public.branches
    where id = v_driver.branch_id and is_active is distinct from false
    for update;
  if not found then
    raise exception 'branch_not_found_or_inactive';
  end if;

  -- Same room/branch consistency check as raos_join_queue, so a driver
  -- can't be queued into a chat room that belongs to an unrelated branch.
  if p_room_id is not null and not exists (
    select 1
    from public.chat_rooms cr
    left join public.branches rb on rb.id = cr.branch_id
    where cr.id = p_room_id and cr.is_active = true and cr.branch_id is not null
      and (cr.branch_id = v_branch.id or cr.branch_id = v_branch.parent_branch_id or rb.parent_branch_id = v_branch.id)
  ) then
    raise exception 'room_branch_mismatch';
  end if;

  -- Same active-queue-locking table/constraint raos_join_queue relies on
  -- -- reused as-is, not reimplemented, per instruction to preserve
  -- existing queue locking/unique-active-queue indexes untouched.
  if exists (
    select 1 from public.raos_driver_queue
    where driver_id = v_driver.id and status in ('waiting','called')
  ) then
    -- Idempotent-safe: a driver double-tapping "join queue" gets a clear
    -- rejection instead of a second row (mirrors raos_join_queue's own
    -- exactly-once-active-entry rule -- no new constraint needed).
    raise exception 'driver_already_in_queue';
  end if;

  select coalesce(max(q.position),0)+1 into v_pos
    from public.raos_driver_queue q
    where q.branch_id = v_branch.id and q.status in ('waiting','called');

  insert into public.raos_driver_queue(driver_id, branch_id, position, status, chat_room_id)
  values (v_driver.id, v_branch.id, v_pos, 'waiting', p_room_id)
  returning id into v_id;

  return query select v_id, v_pos;
end;
$$;

comment on function public.raos_driver_self_join_queue(uuid) is
  'B4 canonical driver self-join. Resolves driver_id/branch_id server-side from the caller''s own user_profiles.driver_id link -- the browser cannot supply or choose a different driver. Narrow role=driver-only RPC; staff/admin/koordinator/driver_manager continue using the existing raos_join_queue unchanged.';

revoke all on function public.raos_driver_self_join_queue(uuid) from public;
-- Only authenticated; the function itself re-checks role=driver, but
-- there is no reason to grant broader roles execute on a driver-only path.
grant execute on function public.raos_driver_self_join_queue(uuid) to authenticated;

-- Explicitly NOT done here, matching "jangan grant driver ke generic
-- raos_join_queue": no change to raos_join_queue's existing grants at all.
