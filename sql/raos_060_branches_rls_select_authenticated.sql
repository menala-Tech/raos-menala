-- ─────────────────────────────────────────────────────────────────────────
-- RAOS 060 — Fix batch D (30 Juli 2026 malam):
--   D1 Tombol Isi Saldo tidak muncul di room Pengisian Saldo cabang.
--      Root cause: RLS di public.branches ENABLED tapi 0 policy SELECT ->
--      client fetch branches.saldo_nominal_options selalu return empty ->
--      activeRoomBranch null -> isSaldoRoomContext=false -> tombol tidak
--      render.
--      Info branches (nama, lat, lng, opsi saldo, timezone) TIDAK sensitif
--      -> boleh dibaca semua authenticated user. Write tetap restricted
--      (bisa ditambah policy WRITE khusus admin/direksi kalau perlu).
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS branches_select_all_authenticated ON public.branches;
CREATE POLICY branches_select_all_authenticated
  ON public.branches FOR SELECT
  TO authenticated
  USING (true);

-- ─────────────────────────────────────────────────────────────────────────
--   D2 Tombol Antrian Driver TIDAK muncul di room Driver cabang.
--      Root cause kedua: RPC get_chat_rooms_for_user tidak return
--      branch_id -> client isDriverRoomContext(room) selalu false.
--      Fix: extend return signature include branch_id.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_chat_rooms_for_user();

CREATE OR REPLACE FUNCTION public.get_chat_rooms_for_user()
RETURNS TABLE(
  id uuid, name text, category text, description text, is_active boolean,
  branch_id uuid,
  auto_delete_days integer,
  last_message_content text, last_message_at timestamp with time zone,
  last_message_sender text, unread_count bigint
)
LANGUAGE sql SET search_path TO 'public' AS $function$
  WITH last_msg AS (
    SELECT DISTINCT ON (m.room_id)
      m.room_id, m.content, m.created_at, m.sender_id
    FROM chat_messages m
    ORDER BY m.room_id, m.created_at DESC
  ),
  reads AS (
    SELECT r.room_id, r.last_read_at
      FROM raos_chat_room_reads r WHERE r.user_id = auth.uid()
  )
  SELECT
    r.id, r.name, r.category, r.description, r.is_active,
    r.branch_id,
    r.auto_delete_days,
    lm.content AS last_message_content,
    lm.created_at AS last_message_at,
    up.full_name AS last_message_sender,
    COALESCE((
      SELECT COUNT(*)::BIGINT
        FROM chat_messages m2
       WHERE m2.room_id = r.id
         AND m2.created_at > COALESCE(rd.last_read_at, 'epoch'::TIMESTAMPTZ)
         AND m2.sender_id != auth.uid()
    ), 0) AS unread_count
  FROM chat_rooms r
  LEFT JOIN last_msg lm ON lm.room_id = r.id
  LEFT JOIN user_profiles up ON up.id = lm.sender_id
  LEFT JOIN reads rd ON rd.room_id = r.id
  WHERE r.is_active = true
  ORDER BY lm.created_at DESC NULLS LAST, r.name ASC;
$function$;

GRANT EXECUTE ON FUNCTION public.get_chat_rooms_for_user() TO authenticated;
