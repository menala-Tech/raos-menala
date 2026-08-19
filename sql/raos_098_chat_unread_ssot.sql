-- =====================================================================
-- Fix B — chat unread badge / read receipt SSOT (round 3: cutover
-- baseline, no synthetic backfill)
-- =====================================================================
-- Root cause (confirmed via live pg_proc read, vlievtojpmrbsmzlqswl,
-- 2026-08-19): get_chat_rooms_for_user()'s unread_count compares
-- chat_messages.created_at against raos_chat_room_reads.last_read_at (a
-- room-level "I opened this room at time X" marker), while the actual
-- per-message read flow writes to chat_message_reads via
-- mark_messages_read() -- a separate, message-granular table. These two
-- systems disagree, so a message can already be read while the yellow
-- unread badge stays lit.
--
-- Architect decision (final, round 3): chat_message_reads is the ONLY
-- message-level read SSOT -- used for the unread badge AND for
-- get_message_read_summary()/get_message_readers() (read receipts).
-- Because it is shared for both purposes, round 2's synthetic historical
-- backfill was rejected: seeding ~2,362 fabricated chat_message_reads
-- rows to avoid an unread spike would have also fabricated read-receipt
-- history (messages nobody actually opened would show as read by
-- everyone). Round 3 instead introduces a CUTOVER TIMESTAMP baseline:
-- everything at/before cutover is simply excluded from the unread count
-- by date, not by a synthetic read row, so read-receipt truth for old
-- messages is completely untouched (no reader rows exist for them, and
-- none are added here).
--
-- Explicitly NOT touched by this migration:
--   - mark_messages_read() -- unchanged, still the canonical writer for
--     the per-message-visible-on-screen read flow.
--   - raos_chat_room_reads -- kept (not dropped), still written by
--     mark_chat_room_read() below for continuity/audit, but no longer
--     read by get_chat_rooms_for_user() for the unread badge.
--   - get_message_read_summary(), get_message_readers() -- not modified;
--     their truthfulness is exactly why round 2's backfill was rejected.
--   - No new index on chat_message_reads: the pre-existing UNIQUE index
--     chat_message_reads_message_id_user_id_key (message_id, user_id)
--     already backs every ON CONFLICT / NOT EXISTS lookup used here and
--     in mark_chat_room_read() below -- verified present, not duplicated.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Step 1: singleton cutover baseline table
-- ---------------------------------------------------------------------
-- One row, one timestamp, set once at apply time. No historical message
-- or read-receipt data is written anywhere by this step -- it only
-- records "when this migration went live" for the unread-count query to
-- compare against.
create table if not exists public.raos_chat_read_cutover (
  id boolean primary key default true check (id = true),
  cutover_at timestamptz not null
);

comment on table public.raos_chat_read_cutover is
  'Fix B round 3 (2026-08-19): singleton cutover baseline for chat unread counting. Messages at/before cutover_at are excluded from unread_count by date (not by a synthetic chat_message_reads row), so pre-cutover history reads as baseline-zero-unread without fabricating read-receipt data. Do not insert a second row (id is a CHECK-constrained singleton).';

alter table public.raos_chat_read_cutover enable row level security;

-- Read-only for app users: every authenticated caller needs to read the
-- one cutover row (get_chat_rooms_for_user() is SECURITY INVOKER, not
-- DEFINER, so it queries this table as the calling user under RLS).
-- No INSERT/UPDATE/DELETE policy or grant for authenticated/anon -- only
-- the migration itself (running with owner/service_role privileges,
-- which bypasses RLS) can seed or move the cutover.
create policy raos_chat_read_cutover_select_authenticated
  on public.raos_chat_read_cutover
  for select
  to authenticated
  using (true);

revoke all on public.raos_chat_read_cutover from public, anon;
grant select on public.raos_chat_read_cutover to authenticated;

-- Seed the singleton row with the cutover instant. ON CONFLICT DO NOTHING
-- makes this idempotent -- re-running this migration will NOT move the
-- cutover forward once it has been set once.
insert into public.raos_chat_read_cutover (id, cutover_at)
values (true, now())
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Step 2: unread_count = post-cutover messages with no read receipt
-- ---------------------------------------------------------------------
create or replace function public.get_chat_rooms_for_user()
returns table(
  id uuid, name text, category text, description text, is_active boolean,
  branch_id uuid, auto_delete_days integer,
  last_message_content text, last_message_at timestamptz, last_message_sender text,
  unread_count bigint
)
language sql
set search_path = public
as $$
  with last_msg as (
    select distinct on (m.room_id)
      m.room_id, m.content, m.created_at, m.sender_id
    from chat_messages m
    order by m.room_id, m.created_at desc
  ),
  cutover as (
    select coalesce(max(cutover_at), 'epoch'::timestamptz) as cutover_at
    from raos_chat_read_cutover
  )
  select
    r.id, r.name, r.category, r.description, r.is_active,
    r.branch_id,
    r.auto_delete_days,
    lm.content as last_message_content,
    lm.created_at as last_message_at,
    up.full_name as last_message_sender,
    coalesce((
      select count(*)::bigint
        from chat_messages m2
       where m2.room_id = r.id
         and m2.sender_id != auth.uid()
         and m2.created_at > cut.cutover_at
         and not exists (
           select 1 from chat_message_reads cmr
            where cmr.message_id = m2.id and cmr.user_id = auth.uid()
         )
    ), 0) as unread_count
  from chat_rooms r
  left join last_msg lm on lm.room_id = r.id
  left join user_profiles up on up.id = lm.sender_id
  cross join cutover cut
  where r.is_active = true
  order by lm.created_at desc nulls last, r.name asc;
$$;

comment on function public.get_chat_rooms_for_user() is
  'Fix B round 3 (2026-08-19): unread_count = messages created after raos_chat_read_cutover AND with no chat_message_reads row for the caller. Pre-cutover history is excluded by date, not by a fabricated read row, so read-receipt truth for old messages is untouched. raos_chat_room_reads no longer consulted here.';

-- ---------------------------------------------------------------------
-- Step 3: mark_chat_room_read() becomes the >50-message safety net
-- ---------------------------------------------------------------------
-- Existing production function (RETURNS void, writes only to
-- raos_chat_room_reads) is replaced -- return type changes (void -> the
-- inserted-row count the frontend now uses for its optimistic UI update),
-- which Postgres requires DROP FUNCTION for, not just CREATE OR REPLACE.
--
-- Why this is needed: chat/page.tsx's loadMessages() only loads/marks-read
-- the latest 50 messages in a room. A room that accumulated >50 new
-- messages since the caller last opened it would otherwise have its
-- badge stuck non-zero forever, since normal scrolling never revisits
-- messages 51+ deep. This RPC bulk-marks EVERY qualifying message in the
-- room as read in one call, not just the visible batch, so opening a
-- room always fully clears its badge regardless of backlog size.
drop function if exists public.mark_chat_room_read(uuid);

create function public.mark_chat_room_read(p_room_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutover timestamptz;
  v_inserted int;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  if not public.raos_is_chat_room_member(p_room_id) then raise exception 'room_not_allowed'; end if;

  select coalesce(max(cutover_at), 'epoch'::timestamptz) into v_cutover
    from public.raos_chat_read_cutover;

  -- Legacy room-level marker: kept for continuity/rollback audit exactly
  -- as the function already did before this migration. No longer
  -- consulted by get_chat_rooms_for_user() for the unread badge, but
  -- writing it costs nothing and preserves it for any other consumer.
  insert into public.raos_chat_room_reads(user_id,room_id,last_read_at,updated_at)
  values(auth.uid(),p_room_id,now(),now())
  on conflict(user_id,room_id)
  do update set last_read_at=now(),updated_at=now();

  -- Canonical: bulk-mark every post-cutover, someone-else's message in
  -- this room as read for the caller. Pre-cutover messages are never
  -- touched here (v_cutover filter) -- opening an old room does not
  -- retroactively fabricate read receipts for its history either.
  insert into public.chat_message_reads(message_id, user_id, read_at)
  select m.id, auth.uid(), now()
  from public.chat_messages m
  where m.room_id = p_room_id
    and m.sender_id <> auth.uid()
    and m.created_at > v_cutover
    and not exists (
      select 1 from public.chat_message_reads cmr
       where cmr.message_id = m.id and cmr.user_id = auth.uid()
    )
  on conflict (message_id, user_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

comment on function public.mark_chat_room_read(uuid) is
  'Fix B round 3 (2026-08-19): bulk-marks every post-cutover message from someone else in the room as read (chat_message_reads), not just the latest-50 batch loadMessages() fetches -- prevents a >50-message backlog from leaving the unread badge stuck. Also still upserts raos_chat_room_reads (legacy, unread badge no longer reads it). Returns inserted-row count for the caller''s optimistic UI update. Requires room membership (raos_is_chat_room_member).';

revoke all on function public.mark_chat_room_read(uuid) from public;
grant execute on function public.mark_chat_room_read(uuid) to authenticated;
