-- ─────────────────────────────────────────────────────────────────────────
-- RAOS 063 — Notification Engine Foundation (Phase F1 dari spec RIFIM
-- Enterprise Platform, 31 Juli 2026).
--
-- Notification Engine sebagai centralized engine untuk seluruh
-- notifikasi lintas modul (Operational/Balance/Attendance/Chat/
-- Dashboard/System). Foundation phase menyiapkan schema + write path +
-- dedup + realtime + audit log + read-sync.
--
-- Fase berikut (F2 UI, F3 WhatsApp, F4 Dashboard metrics) di-build
-- di atas fondasi ini tanpa mengubah signature RPC yang sudah ada.
--
-- Backward compat: `raos_dispatch_push(user_ids,title,body,url,tag,kategori)`
-- signature-nya sama, tapi return type berubah dari void ke jsonb
-- (metadata insert + error info). Semua caller GAS/PWA lama tetap
-- fungsional (return value tidak dipakai kecuali di admin test push).
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Extend schema notifications
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('critical','high','normal','low')),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent','delivered','read','archived','expired')),
  ADD COLUMN IF NOT EXISTS dedup_key text,
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'in_app'
    CHECK (channel IN ('push','in_app','chat','whatsapp','email')),
  ADD COLUMN IF NOT EXISTS payload_type text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- Backfill status berdasar is_read
UPDATE public.notifications SET status = 'read', read_at = COALESCE(read_at, updated_at)
 WHERE is_read = true AND status = 'sent';

-- 2) Indexes untuk performa filter Today/7d/30d + dedup lookup
CREATE INDEX IF NOT EXISTS notif_user_created_idx ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notif_user_status_idx ON public.notifications(user_id, status);
CREATE INDEX IF NOT EXISTS notif_dedup_idx ON public.notifications(user_id, dedup_key, created_at DESC)
  WHERE dedup_key IS NOT NULL;

-- 3) Trigger auto-touch updated_at
CREATE OR REPLACE FUNCTION public.notifications_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_notif_touch ON public.notifications;
CREATE TRIGGER trg_notif_touch BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_touch();

-- 4) Realtime publication (cross-device read sync)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                  WHERE pubname='supabase_realtime' AND tablename='notifications') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
  END IF;
END $$;

-- 5) Delivery log append-only untuk audit
CREATE TABLE IF NOT EXISTS public.notification_delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid REFERENCES public.notifications(id) ON DELETE CASCADE,
  channel text NOT NULL,
  status text NOT NULL,
  error_msg text,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notif_delivery_log_notif_idx ON public.notification_delivery_log(notification_id);
ALTER TABLE public.notification_delivery_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notif_delivery_log_read_owner ON public.notification_delivery_log;
CREATE POLICY notif_delivery_log_read_owner ON public.notification_delivery_log
  FOR SELECT TO authenticated
  USING (notification_id IN (SELECT id FROM public.notifications WHERE user_id = auth.uid())
         OR get_my_role() IN ('admin','management','direksi'));

-- 6) Central write RPC — SATU-SATUNYA entry point untuk semua modul
--    generate notif. Handles dedup (30s window default), backward compat
--    dengan trigger yang belum di-migrate. Return list ID notif.
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
  v_user_id uuid; v_existing_id uuid; v_new_id uuid; v_expires_at timestamptz;
BEGIN
  IF array_length(p_user_ids, 1) IS NULL THEN RETURN; END IF;
  IF p_expires_in_sec IS NOT NULL THEN
    v_expires_at := now() + (p_expires_in_sec || ' seconds')::interval;
  END IF;
  FOREACH v_user_id IN ARRAY p_user_ids LOOP
    v_existing_id := NULL;
    IF p_dedup_key IS NOT NULL THEN
      SELECT id INTO v_existing_id FROM notifications
       WHERE user_id = v_user_id AND dedup_key = p_dedup_key
         AND created_at > now() - (p_dedup_window_sec || ' seconds')::interval
         AND status <> 'archived'
       ORDER BY created_at DESC LIMIT 1;
    END IF;
    IF v_existing_id IS NOT NULL THEN
      UPDATE notifications
         SET title = p_title, body = p_body, data = p_data,
             priority = p_priority, status = 'sent', is_read = false, read_at = NULL
       WHERE id = v_existing_id RETURNING id INTO v_new_id;
    ELSE
      INSERT INTO notifications (
        user_id, title, body, type, payload_type, priority, channel,
        data, dedup_key, expires_at, status
      ) VALUES (
        v_user_id, p_title, p_body, p_type, p_payload_type, p_priority, p_channel,
        p_data, p_dedup_key, v_expires_at, 'sent'
      ) RETURNING id INTO v_new_id;
    END IF;
    RETURN NEXT v_new_id;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.raos_create_notification(uuid[],text,text,text,text,text,text,jsonb,text,int,int) FROM public;
GRANT EXECUTE ON FUNCTION public.raos_create_notification(uuid[],text,text,text,text,text,text,jsonb,text,int,int) TO authenticated, service_role;

-- 7) Refactor raos_dispatch_push: write in-app row DULU (SSOT), baru fire
--    push. Push failure ≠ notif failure — in-app tetap tersimpan +
--    error tercatat di notification_delivery_log.
DROP FUNCTION IF EXISTS public.raos_dispatch_push(uuid[],text,text,text,text,text);

CREATE FUNCTION public.raos_dispatch_push(
  user_ids uuid[], title text, body text,
  url text DEFAULT NULL, tag text DEFAULT NULL, kategori text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public','extensions','vault' AS $$
DECLARE
  v_secret text; v_notif_ids uuid[];
  v_kategori text := COALESCE(kategori, 'system');
BEGIN
  IF array_length(user_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty_user_ids');
  END IF;
  SELECT array_agg(id) INTO v_notif_ids FROM raos_create_notification(
    user_ids, title, body, v_kategori, v_kategori, 'normal', 'push',
    jsonb_build_object('url', url, 'tag', tag), tag, 30, NULL
  );
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'raos_service_role_key' LIMIT 1;
  IF v_secret IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'vault_secret_missing', 'notif_ids', v_notif_ids);
  END IF;
  BEGIN
    PERFORM net.http_post(
      url := 'https://vlievtojpmrbsmzlqswl.supabase.co/functions/v1/raos-send-push',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_secret),
      body := jsonb_build_object('user_ids',user_ids,'title',title,'body',body,'url',url,'tag',tag,'kategori',v_kategori)
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO notification_delivery_log (notification_id, channel, status, error_msg)
    SELECT id, 'push', 'failed', SQLERRM FROM unnest(v_notif_ids) AS id;
    RETURN jsonb_build_object('ok', false, 'push_error', SQLERRM, 'notif_ids', v_notif_ids);
  END;
  RETURN jsonb_build_object('ok', true, 'notif_ids', v_notif_ids);
END;
$$;
GRANT EXECUTE ON FUNCTION public.raos_dispatch_push(uuid[],text,text,text,text,text) TO authenticated, service_role;

-- 8) Read-sync RPC — cross-device (tabs, mobile, desktop)
CREATE OR REPLACE FUNCTION public.raos_mark_notifications_read(p_ids uuid[])
RETURNS int LANGUAGE plpgsql SECURITY INVOKER SET search_path = 'public' AS $$
DECLARE v_count int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  UPDATE notifications SET is_read = true, status = 'read', read_at = now()
   WHERE user_id = auth.uid() AND id = ANY(p_ids) AND status <> 'read';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.raos_mark_notifications_read(uuid[]) TO authenticated;

-- 9) Expire cron helper — dipanggil oleh scheduler (GAS/pg_cron)
CREATE OR REPLACE FUNCTION public.raos_expire_notifications()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_count int;
BEGIN
  UPDATE notifications SET status = 'expired'
   WHERE expires_at IS NOT NULL AND expires_at < now() AND status IN ('sent','delivered');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.raos_expire_notifications() TO service_role;
