-- raos_065_fix_dispatch_push_column_id.sql
--
-- Bug (feedback user 1 Agustus 2026 pagi): SEMUA insert chat_messages gagal
-- dengan error 'column "id" does not exist'. Root cause: RPC raos_dispatch_push
-- dipanggil dari trigger AFTER INSERT chat_messages, dan memakai
-- `SELECT array_agg(id) FROM raos_create_notification(...)`. Tapi
-- raos_create_notification return SETOF uuid — kolom bawaan bernama
-- 'raos_create_notification', bukan 'id'. Akibatnya trigger raise error dan
-- seluruh transaksi INSERT chat_messages ROLLBACK → user tidak bisa kirim
-- pesan di room manapun.
--
-- Fix: pakai `ARRAY(SELECT raos_create_notification(...))` sehingga tidak
-- bergantung ke nama kolom. Sekalian rapikan unnest di catch block pakai
-- alias 'nid' supaya jelas.

CREATE OR REPLACE FUNCTION public.raos_dispatch_push(
  user_ids uuid[], title text, body text,
  url text DEFAULT NULL::text, tag text DEFAULT NULL::text, kategori text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'vault'
AS $function$
DECLARE
  v_secret text; v_notif_ids uuid[];
  v_kategori text := COALESCE(kategori, 'system');
BEGIN
  IF array_length(user_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty_user_ids');
  END IF;

  v_notif_ids := ARRAY(
    SELECT raos_create_notification(
      user_ids, title, body, v_kategori, v_kategori, 'normal', 'push',
      jsonb_build_object('url', url, 'tag', tag), tag, 30, NULL
    )
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
    SELECT nid, 'push', 'failed', SQLERRM FROM unnest(v_notif_ids) AS nid;
    RETURN jsonb_build_object('ok', false, 'push_error', SQLERRM, 'notif_ids', v_notif_ids);
  END;
  RETURN jsonb_build_object('ok', true, 'notif_ids', v_notif_ids);
END;
$function$;
