-- RAOS 110 — PWA Notification Engine V2: fail-closed recipient targeting.
--
-- Owner rule (2026-08-20): notification/background delivery is eligible ONLY
-- for staff, koordinator, admin, and driver. Management/direksi/direktur and
-- any future/unknown role must not receive RAOS notifications.
--
-- Defense in depth:
--   1) raos_create_notification() skips ineligible/inactive recipients.
--   2) raos_dispatch_push() filters recipients BEFORE writing in-app rows and
--      BEFORE calling raos-send-push.
--   3) chat trigger selects only eligible active room members/mentions.
--   4) direct authenticated execution of raos_dispatch_push is revoked;
--      app-origin pushes use the guarded Edge Function, while DB triggers and
--      service-role automations keep working under their privileged context.

-- ---------------------------------------------------------------------------
-- 1. Central notification write path: never create a notification row for an
--    inactive or excluded role.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.raos_create_notification(
  p_user_ids uuid[],
  p_title text, p_body text,
  p_type text DEFAULT NULL,
  p_payload_type text DEFAULT NULL,
  p_priority text DEFAULT 'normal',
  p_channel text DEFAULT 'in_app',
  p_data jsonb DEFAULT '{}'::jsonb,
  p_dedup_key text DEFAULT NULL,
  p_dedup_window_sec int DEFAULT 30,
  p_expires_in_sec int DEFAULT NULL
) RETURNS SETOF uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_user_id uuid;
  v_existing_id uuid;
  v_new_id uuid;
  v_expires_at timestamptz;
BEGIN
  IF array_length(p_user_ids, 1) IS NULL THEN RETURN; END IF;

  IF p_expires_in_sec IS NOT NULL THEN
    v_expires_at := now() + (p_expires_in_sec || ' seconds')::interval;
  END IF;

  FOREACH v_user_id IN ARRAY p_user_ids LOOP
    -- Fail closed: only the four operational roles can receive RAOS notifs.
    IF NOT EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = v_user_id
        AND up.is_active IS TRUE
        AND lower(up.role::text) = ANY (ARRAY['staff','koordinator','admin','driver'])
    ) THEN
      CONTINUE;
    END IF;

    v_existing_id := NULL;
    IF p_dedup_key IS NOT NULL THEN
      SELECT id INTO v_existing_id
      FROM public.notifications
      WHERE user_id = v_user_id
        AND dedup_key = p_dedup_key
        AND created_at > now() - (p_dedup_window_sec || ' seconds')::interval
        AND status <> 'archived'
      ORDER BY created_at DESC
      LIMIT 1;
    END IF;

    IF v_existing_id IS NOT NULL THEN
      UPDATE public.notifications
      SET title = p_title,
          body = p_body,
          data = p_data,
          priority = p_priority,
          status = 'sent',
          is_read = false,
          read_at = NULL
      WHERE id = v_existing_id
      RETURNING id INTO v_new_id;
    ELSE
      INSERT INTO public.notifications (
        user_id, title, body, type, payload_type, priority, channel,
        data, dedup_key, expires_at, status
      ) VALUES (
        v_user_id, p_title, p_body, p_type, p_payload_type, p_priority, p_channel,
        p_data, p_dedup_key, v_expires_at, 'sent'
      )
      RETURNING id INTO v_new_id;
    END IF;

    RETURN NEXT v_new_id;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.raos_create_notification(uuid[],text,text,text,text,text,text,jsonb,text,int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.raos_create_notification(uuid[],text,text,text,text,text,text,jsonb,text,int,int) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Central Web Push dispatcher: filter BEFORE both in-app write and Edge
--    Function delivery. This protects every caller, including GAS/DB triggers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.raos_dispatch_push(
  user_ids uuid[], title text, body text,
  url text DEFAULT NULL::text,
  tag text DEFAULT NULL::text,
  kategori text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'vault'
AS $$
DECLARE
  v_secret text;
  v_notif_ids uuid[];
  v_effective_user_ids uuid[];
  v_kategori text := COALESCE(kategori, 'system');
  v_requested_count int := COALESCE(array_length(user_ids, 1), 0);
  v_effective_count int := 0;
BEGIN
  IF v_requested_count = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty_user_ids');
  END IF;

  SELECT array_agg(DISTINCT up.id)
    INTO v_effective_user_ids
  FROM public.user_profiles up
  WHERE up.id = ANY(user_ids)
    AND up.is_active IS TRUE
    AND lower(up.role::text) = ANY (ARRAY['staff','koordinator','admin','driver']);

  v_effective_count := COALESCE(array_length(v_effective_user_ids, 1), 0);

  IF v_effective_count = 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'sent', 0,
      'effective_targets', 0,
      'role_filtered_out', v_requested_count,
      'note', 'no_eligible_recipient_roles'
    );
  END IF;

  v_notif_ids := ARRAY(
    SELECT public.raos_create_notification(
      v_effective_user_ids, title, body, v_kategori, v_kategori, 'normal', 'push',
      jsonb_build_object('url', url, 'tag', tag), tag, 30, NULL
    )
  );

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'raos_service_role_key'
  LIMIT 1;

  IF v_secret IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'vault_secret_missing',
      'notif_ids', v_notif_ids,
      'effective_targets', v_effective_count,
      'role_filtered_out', GREATEST(v_requested_count - v_effective_count, 0)
    );
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := 'https://vlievtojpmrbsmzlqswl.supabase.co/functions/v1/raos-send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_secret
      ),
      body := jsonb_build_object(
        'user_ids', v_effective_user_ids,
        'title', title,
        'body', body,
        'url', url,
        'tag', tag,
        'kategori', v_kategori
      )
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.notification_delivery_log (notification_id, channel, status, error_msg)
    SELECT nid, 'push', 'failed', SQLERRM
    FROM unnest(v_notif_ids) AS nid;

    RETURN jsonb_build_object(
      'ok', false,
      'push_error', SQLERRM,
      'notif_ids', v_notif_ids,
      'effective_targets', v_effective_count,
      'role_filtered_out', GREATEST(v_requested_count - v_effective_count, 0)
    );
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'notif_ids', v_notif_ids,
    'effective_targets', v_effective_count,
    'role_filtered_out', GREATEST(v_requested_count - v_effective_count, 0)
  );
END;
$$;

-- Direct browser RPC is unnecessary and would let arbitrary authenticated
-- users fan-out service-role pushes. DB trigger functions run as their owner;
-- server automations use service_role.
REVOKE ALL ON FUNCTION public.raos_dispatch_push(uuid[],text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.raos_dispatch_push(uuid[],text,text,text,text,text) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Chat recipient selection: only active eligible roles enter the dispatcher.
--    raos_dispatch_push repeats the filter as a final safety boundary.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.raos_notify_new_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_room record;
  v_sender_name text;
  v_target_ids uuid[];
  v_mention_ids uuid[];
  v_title text;
  v_body text;
  v_url text;
  v_tag text;
  v_kategori text;
  v_preview text;
BEGIN
  SELECT id, name, category, branch_id, is_active
    INTO v_room
  FROM public.chat_rooms
  WHERE id = NEW.room_id;

  IF v_room IS NULL OR v_room.is_active = false THEN RETURN NEW; END IF;

  SELECT COALESCE(full_name, 'Staff')
    INTO v_sender_name
  FROM public.user_profiles
  WHERE id = NEW.sender_id;

  v_preview := CASE NEW.type
    WHEN 'text' THEN left(COALESCE(NEW.content, ''), 100)
    WHEN 'image' THEN '📷 Foto'
    WHEN 'audio' THEN '🎤 Voice message'
    WHEN 'saldo_request' THEN '💰 Pengajuan Isi Saldo'
    WHEN 'driver_queue' THEN '🚕 Antrian driver'
    WHEN 'poll' THEN '📊 Polling baru'
    ELSE '💬 Pesan baru'
  END;

  IF lower(v_room.name) LIKE '%pengumuman%' THEN
    v_kategori := 'pengumuman';
    v_tag := 'pengumuman-' || NEW.id;
    v_title := '📢 Pengumuman Baru';
    v_body := v_sender_name || ': ' || v_preview;
  ELSE
    v_kategori := 'chat_room';
    v_tag := 'chat-' || v_room.id;
    v_title := v_sender_name || ' — ' || v_room.name;
    v_body := v_preview;
  END IF;

  v_url := '/chat';

  SELECT array_agg(crm.user_id)
    INTO v_target_ids
  FROM public.chat_room_members crm
  JOIN public.user_profiles up ON up.id = crm.user_id
  WHERE crm.room_id = NEW.room_id
    AND crm.user_id <> NEW.sender_id
    AND up.is_active IS TRUE
    AND lower(up.role::text) = ANY (ARRAY['staff','koordinator','admin','driver'])
    AND (NEW.mentions IS NULL OR NOT (crm.user_id = ANY(NEW.mentions)));

  IF v_target_ids IS NOT NULL AND array_length(v_target_ids, 1) > 0 THEN
    PERFORM public.raos_dispatch_push(v_target_ids, v_title, v_body, v_url, v_tag, v_kategori);
  END IF;

  IF NEW.mentions IS NOT NULL AND array_length(NEW.mentions, 1) > 0 THEN
    v_mention_ids := ARRAY(
      SELECT up.id
      FROM public.user_profiles up
      WHERE up.id = ANY(NEW.mentions)
        AND up.is_active IS TRUE
        AND up.id <> NEW.sender_id
        AND lower(up.role::text) = ANY (ARRAY['staff','koordinator','admin','driver'])
    );

    IF array_length(v_mention_ids, 1) > 0 THEN
      PERFORM public.raos_dispatch_push(
        v_mention_ids,
        '📣 Anda di-tag di ' || v_room.name,
        v_sender_name || ': ' || v_preview,
        v_url,
        'mention-' || NEW.id,
        'pengumuman'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
