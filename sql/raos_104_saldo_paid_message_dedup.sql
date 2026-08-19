-- raos_104_saldo_paid_message_dedup — DRAFT, NOT APPLIED
-- (renamed from raos_102 per Architect review — 102/103 already taken in
-- production by raos_102_admin_head_office_kpi and
-- raos_103_invoice_coordinator_manual_finance; next free number is 104.)
-- Finding 1 (2026-08-19 fixpack): confirmed in production, one
-- raos_saldo_requests transition to is_processed=true produces TWO paid
-- chat messages for the same request:
--   A. raos_saldo_mark_paid() RPC's own explicit chat_messages INSERT
--      ("✅ Saldo sudah diisi oleh admin...")
--   B. trg_raos_saldo_after_processed (BEFORE UPDATE OF is_processed) ->
--      raos_saldo_after_processed()'s chat_messages INSERT
--      ("✅ SALDO SUDAH DIISI ... — Sistem RAOS")
--
-- Audit before this patch (read-only, production Supabase
-- vlievtojpmrbsmzlqswl):
--   - pg_proc scan for `is_processed = true` writers: raos_saldo_mark_paid
--     is the ONLY function that ever sets is_processed=true. No other RPC,
--     trigger, or Edge Function writes it.
--   - pg_policies on raos_saldo_requests: only 3 SELECT policies exist
--     (staff own, koordinator/admin branch-scope, driver own) — NO
--     client-facing UPDATE policy. A raw client PATCH of is_processed is
--     impossible under RLS; the RPC (SECURITY DEFINER) is the sole path.
--   - GAS crmApi.js `_finSaldoRaosMarkPaid_` calls this exact RPC and
--     nothing else after it (no separate chat insert on the GAS side).
--   - Conclusion: no hidden dependency on the RPC's own chat insert.
--     Canonical owner = raos_saldo_after_processed (fires on EVERY
--     is_processed false->true transition regardless of entry point --
--     manual Finance today, MENALA AIST Worker again later if/when it
--     resumes writing is_processed directly or via this same RPC).
--
-- Patch:
--   1. raos_saldo_mark_paid: remove its own "Exactly-once room
--      confirmation" chat_messages INSERT block entirely. Everything else
--      (role gate, processor-mismatch check, aist_job_in_progress guard,
--      is_processed UPDATE, aist_jobs manual-confirm upsert) is UNCHANGED.
--      Result: this RPC is now pure canonical state mutation, no chat
--      writer of any kind.
--   2. raos_saldo_after_processed: guard tightened to
--      `OLD.is_processed IS DISTINCT FROM TRUE AND NEW.is_processed = TRUE`
--      (never re-fires on a later UPDATE of an already-processed row).
--      Paid-room writer corrected per Architect final review round to go
--      through the CANONICAL raos_post_system_message() helper instead of
--      a raw chat_messages INSERT with sender_id = v_sender_id --
--      v_sender_id can be NEW.processed_by (a real Admin user id), and a
--      raw 'text' insert with that sender_id would have rendered the paid
--      message as that Admin, not "🤖 Sistem RAOS". raos_post_system_message
--      always inserts sender_id = NULL, type = 'system', matching every
--      other system notification already in production (e.g. the
--      saldo_belum_diisi reminders). v_sender_id itself is UNCHANGED and
--      still used for the KPI progress message to the staff's private
--      room further down in this same function -- that message is
--      deliberately a real Admin/bot identity, not a system message; only
--      the paid-room writer moved to the canonical helper.
--      Idempotency guard is deterministic on system-message metadata
--      (`"event": "saldo_paid"` + `"request_id": "<NEW.id>"`, both exact
--      JSON key:value substrings embedded by raos_post_system_message's
--      own SYSMETA convention) -- NOT on sender/admin identity, NOT on
--      driver name or nominal. NEW.id is this row's own primary key,
--      which IS this request's request_id (raos_saldo_requests has no
--      separate request_id column; aist_jobs.request_id references this
--      same id). Not strictly required for correctness today (this
--      trigger fires exactly once per false->true UPDATE per the guard
--      above, and the RPC guards re-processing via
--      `if v.is_processed then return already_processed`), but a
--      defensive net against any hypothetical future replay/direct write
--      path (e.g. MENALA AIST Worker flipping is_processed directly) --
--      "bila aman" per architect instruction, zero behavior change in the
--      normal path.
--
-- Expected final invariant: one raos_saldo_requests transition
-- false->true = exactly ONE chat message for that request, and that
-- message is type='system' (sender_id NULL) -> UI renders "🤖 Sistem RAOS",
-- never a specific Admin's identity.
--
-- No history changed: old duplicate messages (both A and B copies already
-- sent for past requests) are left exactly as they are in chat_messages.
-- This migration only changes future behavior.

CREATE OR REPLACE FUNCTION public.raos_saldo_mark_paid(p_request_id uuid, p_processor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v public.raos_saldo_requests%rowtype;
  r text;
  caller uuid := auth.uid();
  jwtrole text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  if p_request_id is null or p_processor_id is null then
    raise exception 'invalid_input';
  end if;

  if jwtrole <> 'service_role' and caller is distinct from p_processor_id then
    raise exception 'processor_mismatch';
  end if;

  select role into r
  from public.user_profiles
  where id = p_processor_id and is_active = true;

  if lower(coalesce(r, '')) not in ('admin', 'direksi', 'direktur') then
    raise exception 'role_not_allowed';
  end if;

  select * into v
  from public.raos_saldo_requests
  where id = p_request_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v.is_processed then
    return jsonb_build_object('status', 'already_processed', 'row', to_jsonb(v));
  end if;

  if v.status not in ('pending', 'approved') then
    return jsonb_build_object(
      'status', 'not_processable',
      'current_status', v.status,
      'row', to_jsonb(v)
    );
  end if;

  -- Never let a manual Finance confirmation overwrite a job currently owned
  -- by the desktop agent. This keeps one production owner per request and
  -- prevents manual/worker double-processing when the worker is enabled again.
  if exists (
    select 1
    from public.aist_jobs j
    where j.request_id = v.id
      and j.status in ('claimed', 'running', 'verifying')
  ) then
    raise exception 'aist_job_in_progress';
  end if;

  update public.raos_saldo_requests
  set is_processed = true,
      processed_at = now(),
      processed_by = p_processor_id,
      updated_at = now()
  where id = p_request_id
  returning * into v;

  -- Manual operation mode while the desktop worker is being rebuilt:
  -- Finance's explicit LUNAS action is the human confirmation that AIST was
  -- completed manually. Preserve that distinction in aist_result/reference.
  -- If the request has no driver login ID, do NOT fabricate an AIST success;
  -- the daily invoice will remain mismatch until identity is corrected.
  if nullif(trim(coalesce(v.driver_login_id, '')), '') is not null then
    insert into public.aist_jobs (
      request_id,
      branch_id,
      staff_id,
      driver_id,
      driver_login_id,
      driver_name,
      nominal,
      requested_at,
      auto_after,
      sla_deadline,
      status,
      mode,
      manual_requested_at,
      manual_requested_by,
      claimed_by_operator,
      started_at,
      completed_at,
      attempt_count,
      aist_reference,
      aist_result,
      error_code,
      error_message,
      updated_at
    ) values (
      v.id,
      v.branch_id,
      v.staff_id,
      v.driver_id,
      v.driver_login_id,
      v.driver_name,
      v.nominal,
      v.requested_at,
      v.requested_at + interval '60 seconds',
      v.requested_at + interval '120 seconds',
      'success',
      'manual',
      now(),
      p_processor_id,
      p_processor_id,
      now(),
      now(),
      1,
      'MANUAL_FINANCE_CONFIRM',
      jsonb_build_object(
        'verification_mode', 'manual_admin_confirmation',
        'processor_id', p_processor_id,
        'confirmed_at', now()
      ),
      null,
      null,
      now()
    )
    on conflict (request_id) do update
    set branch_id = excluded.branch_id,
        staff_id = excluded.staff_id,
        driver_id = excluded.driver_id,
        driver_login_id = excluded.driver_login_id,
        driver_name = excluded.driver_name,
        nominal = excluded.nominal,
        requested_at = excluded.requested_at,
        status = 'success',
        mode = 'manual',
        manual_requested_at = coalesce(public.aist_jobs.manual_requested_at, now()),
        manual_requested_by = p_processor_id,
        claimed_by_operator = p_processor_id,
        started_at = coalesce(public.aist_jobs.started_at, now()),
        completed_at = now(),
        attempt_count = greatest(public.aist_jobs.attempt_count, 1),
        aist_reference = 'MANUAL_FINANCE_CONFIRM',
        aist_result = jsonb_build_object(
          'verification_mode', 'manual_admin_confirmation',
          'processor_id', p_processor_id,
          'confirmed_at', now()
        ),
        error_code = null,
        error_message = null,
        updated_at = now();
  end if;

  -- Finding 1 fix (2026-08-19): paid-message chat INSERT removed from
  -- this RPC. Canonical owner is now trg_raos_saldo_after_processed ->
  -- raos_saldo_after_processed(), which fires on this exact UPDATE
  -- statement's is_processed false->true transition regardless of which
  -- entry point flipped it (manual Finance here, or AIST Worker later).
  -- Do NOT re-add a chat insert here — see raos_104 migration header.

  return jsonb_build_object('status', 'updated', 'row', to_jsonb(v));
end
$function$;

CREATE OR REPLACE FUNCTION public.raos_saldo_after_processed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_staff_name text;
  v_branch_name text;
  v_sender_id uuid;
  v_pribadi_room_id uuid;
  v_snapshot record;
  v_pin_emoji text;
  v_pin_label text;
  v_hint text;
  v_target_display text;
  v_realisasi_display text;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  -- Architect review (2026-08-19): guard tightened from `OLD.is_processed
  -- = false` to `IS DISTINCT FROM TRUE` -- functionally identical for the
  -- normal false->true case, but also correctly skips (rather than
  -- silently NULL-failing the boolean AND) on any hypothetical row where
  -- OLD.is_processed was NULL, and unambiguously blocks re-fire on any
  -- later UPDATE of an already-processed row (OLD.is_processed = true ->
  -- IS DISTINCT FROM TRUE = false -> RETURN NEW, no message).
  IF NOT (OLD.is_processed IS DISTINCT FROM TRUE AND NEW.is_processed = TRUE) THEN RETURN NEW; END IF;

  SELECT full_name INTO v_staff_name
  FROM user_profiles
  WHERE id = NEW.staff_id;

  SELECT name INTO v_branch_name
  FROM branches
  WHERE id = NEW.branch_id;

  v_sender_id := COALESCE(NEW.processed_by, public.raos_get_system_bot_id());

  PERFORM raos_dispatch_push(
    ARRAY[NEW.staff_id],
    'Saldo Anda Sudah Diisi',
    format(
      'Isi saldo Rp%s (%s) sudah diproses admin. Silakan cek di aplikasi.',
      to_char(NEW.nominal, 'FM999,999,999'),
      NEW.request_no
    ),
    '/riwayat',
    'saldo-processed-' || NEW.id,
    'pengumuman'
  );

  -- Finding 1 fix (2026-08-19), corrected per Architect final review: this
  -- trigger is the SOLE owner of the paid confirmation chat message
  -- (raos_saldo_mark_paid's own copy was removed, see raos_104 migration
  -- header). Paid-room writer now goes through the CANONICAL
  -- raos_post_system_message() helper instead of a raw chat_messages
  -- INSERT with sender_id = v_sender_id -- v_sender_id can be
  -- NEW.processed_by (a real Admin user id), and a raw 'text' insert with
  -- that sender_id would render as that Admin in chat, not
  -- "🤖 Sistem RAOS". raos_post_system_message always inserts
  -- sender_id = NULL, type = 'system', so the UI renders this consistently
  -- as the system bot regardless of which admin processed the request.
  -- v_sender_id itself is NOT removed -- still used unchanged below for
  -- the KPI progress message to the staff's private room, which is
  -- deliberately a real Admin/bot identity, not a system message.
  --
  -- Idempotency guard: deterministic on system-message metadata, NOT on
  -- sender/admin identity. raos_post_system_message embeds p_metadata as
  -- a leading `<!--SYSMETA:{"category":...,"meta":{...},"ts":...}-->`
  -- block in `content` (existing convention, same as every
  -- saldo_belum_diisi reminder already in production) -- the UI already
  -- knows to render `type='system'` rows as "🤖 Sistem RAOS" and hide the
  -- raw SYSMETA block, so no new rendering behavior is introduced here.
  -- Canonical identity for the guard = "event":"saldo_paid" +
  -- "request_id":"<NEW.id>" (both exact JSON key:value substrings,
  -- matching the p_metadata below) -- NEW.id is this row's own primary
  -- key, which IS this request's request_id (raos_saldo_requests has no
  -- separate request_id column; aist_jobs.request_id references this same
  -- id). Not required for correctness today (this trigger fires exactly
  -- once per false->true UPDATE per the tightened OLD/NEW guard above, and
  -- raos_saldo_mark_paid already guards re-processing via
  -- `if v.is_processed then return already_processed`), but a defensive
  -- net against any hypothetical future replay/direct write path.
  IF NEW.chat_room_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM chat_messages m
       WHERE m.room_id = NEW.chat_room_id
         AND m.type = 'system'
         AND m.content LIKE '%"event": "saldo_paid"%'
         AND m.content LIKE '%"request_id": "' || NEW.id::text || '"%'
     ) THEN
    PERFORM public.raos_post_system_message(
      NEW.chat_room_id,
      format(
        E'✅ SALDO SUDAH DIISI\n\n%s • Rp%s\nDriver: %s\nCabang: %s\nDiproses: %s',
        NEW.request_no,
        to_char(NEW.nominal, 'FM999,999,999'),
        COALESCE(NEW.driver_name, '-'),
        COALESCE(v_branch_name, '-'),
        to_char(COALESCE(NEW.processed_at, now()) AT TIME ZONE 'Asia/Makassar', 'DD Mon YYYY HH24:MI')
      ),
      'saldo_paid',
      jsonb_build_object(
        'event', 'saldo_paid',
        'request_id', NEW.id,
        'request_no', NEW.request_no,
        'processed_by', NEW.processed_by,
        'nominal', NEW.nominal
      )
    );
  END IF;

  -- Existing KPI progress ke chat pribadi staff. Unchanged.
  IF v_sender_id IS NOT NULL AND v_sender_id <> NEW.staff_id THEN
    SELECT s.mode, s.target_val, s.realisasi_val, s.pct
      INTO v_snapshot
      FROM public.raos_saldo_progress_snapshot(NEW.staff_id) s
      LIMIT 1;

    IF v_snapshot.target_val IS NOT NULL AND v_snapshot.target_val > 0 THEN
      IF v_snapshot.pct >= 100 THEN
        v_pin_emoji := '🟢';
        v_pin_label := 'TARGET TERCAPAI';
        v_hint := 'Selamat! Target bulan ini sudah tercapai. Pertahankan.';
      ELSIF v_snapshot.pct >= 50 THEN
        v_pin_emoji := '🟡';
        v_pin_label := 'MENUJU TARGET';
        v_hint := 'Semangat! Kejar sisa target sebelum akhir bulan.';
      ELSE
        v_pin_emoji := '🔴';
        v_pin_label := 'WASPADA';
        v_hint := 'Realisasi masih jauh dari target. Ayo fokus & tambah upaya.';
      END IF;

      IF v_snapshot.mode = 'order' THEN
        v_target_display := format('%s scan valid', to_char(v_snapshot.target_val, 'FM999,999,999'));
        v_realisasi_display := format('%s scan valid', to_char(v_snapshot.realisasi_val, 'FM999,999,999'));
      ELSE
        v_target_display := 'Rp' || to_char(v_snapshot.target_val, 'FM999,999,999');
        v_realisasi_display := 'Rp' || to_char(v_snapshot.realisasi_val, 'FM999,999,999');
      END IF;

      v_pribadi_room_id := public.raos_ensure_pribadi_room(NEW.staff_id, v_sender_id);

      IF v_pribadi_room_id IS NOT NULL THEN
        INSERT INTO chat_messages (room_id, sender_id, type, content)
        VALUES (
          v_pribadi_room_id,
          v_sender_id,
          'text',
          format(
            E'%s *%s*\n\n📊 Pencapaian Target Bulan Ini (%s)\n\nTarget: %s\nRealisasi: %s\nPersentase: %s%%\n\n%s\n\n— Sistem Bot RAOS',
            v_pin_emoji,
            v_pin_label,
            CASE WHEN v_snapshot.mode = 'order' THEN 'Order — Scan Valid' ELSE 'Saldo — Nominal' END,
            v_target_display,
            v_realisasi_display,
            to_char(v_snapshot.pct, 'FM999,999,990.0'),
            v_hint
          )
        );

        PERFORM raos_dispatch_push(
          ARRAY[NEW.staff_id],
          v_pin_emoji || ' Pencapaian ' || to_char(v_snapshot.pct, 'FM999,999,990.0') || '%',
          format('%s dari target %s. Cek chat pribadi.', v_realisasi_display, v_target_display),
          '/chat',
          'saldo-progress-' || NEW.id,
          'pengumuman'
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
