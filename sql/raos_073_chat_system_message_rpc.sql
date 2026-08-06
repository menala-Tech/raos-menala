-- ============================================================
-- raos_073 — Chat system message RPC (Fonnte deprecation)
-- ============================================================
--
-- Konteks: Sesi 3 chat migration — deprecate 100% Fonnte,
-- redirect semua notif WA (12 call site di rifim-os) ke chat room RAOS.
--
-- Perubahan:
--   1) Extend chat_messages.type CHECK — tambah 'system'
--   2) RPC raos_post_system_message() — GAS/backend post message tanpa sender_id
--      (SECURITY DEFINER, service_role only)
--   3) RPC raos_resolve_saldo_room(branch_id) — helper lookup room saldo cabang
--   4) RPC raos_resolve_announcement_room() — helper lookup room "Pengumuman" global
--
-- Notes:
--   - sender_id NULL untuk system message → UI harus tampilkan "🤖 Sistem" fallback
--   - Semua RPC SECURITY DEFINER dengan search_path=public untuk keamanan
--   - EXECUTE grant hanya ke service_role (GAS via SERVICE_KEY vault)
-- ============================================================

-- ── 1) EXTEND chat_messages.type CHECK ─────────────────────────
ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_type_check;

ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_type_check
  CHECK (type = ANY (ARRAY[
    'text'::text,
    'image'::text,
    'file'::text,
    'location'::text,
    'poll'::text,
    'audio'::text,
    'saldo_request'::text,
    'driver_queue'::text,
    'system'::text            -- NEW: notif dari GAS/backend (sender_id NULL)
  ]));

-- ── 2) RPC raos_post_system_message ────────────────────────────
-- Post pesan system ke chat room. Dipanggil dari GAS via service_role.
--
-- Params:
--   p_room_id     — target chat_rooms.id
--   p_content     — body pesan (plaintext atau markdown)
--   p_category    — subkategori untuk filtering push (e.g. 'sla_saldo',
--                   'sla_potongan', 'hris_kontrak', 'finance_rekap',
--                   'doc_created', 'payroll', 'saldo_rendah')
--   p_metadata    — JSONB payload (optional) — untuk struktur data terkait
--                   (mis. { cabang: 'BTH', driver_id: 'RIF001', nominal: 100000 })
--
-- Returns: chat_messages.id (uuid)

CREATE OR REPLACE FUNCTION public.raos_post_system_message(
  p_room_id  uuid,
  p_content  text,
  p_category text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message_id uuid;
  v_room_exists boolean;
BEGIN
  -- Guard: room harus ada + aktif
  SELECT EXISTS(SELECT 1 FROM chat_rooms WHERE id = p_room_id AND is_active = true)
  INTO v_room_exists;

  IF NOT v_room_exists THEN
    RAISE EXCEPTION 'Chat room % not found or inactive', p_room_id
      USING ERRCODE = 'P0002';
  END IF;

  IF p_content IS NULL OR length(trim(p_content)) = 0 THEN
    RAISE EXCEPTION 'p_content cannot be empty'
      USING ERRCODE = '22023';
  END IF;

  -- Build content dengan optional metadata prefix (JSON di baris pertama)
  -- Format: kalau ada metadata, embed sebagai JSON komentar di awal
  -- UI PWA bisa parse metadata untuk render enrichment
  INSERT INTO chat_messages (room_id, sender_id, type, content, client_id)
  VALUES (
    p_room_id,
    NULL,           -- system message, no sender
    'system',
    CASE
      WHEN p_metadata IS NOT NULL THEN
        '<!--SYSMETA:' || (
          jsonb_build_object(
            'category', p_category,
            'meta', p_metadata,
            'ts', extract(epoch from now())::bigint
          )
        )::text || '-->' || E'\n' || p_content
      ELSE p_content
    END,
    gen_random_uuid()   -- unique client_id supaya dedup Realtime tetap jalan
  )
  RETURNING id INTO v_message_id;

  RETURN v_message_id;
END;
$$;

REVOKE ALL ON FUNCTION public.raos_post_system_message(uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.raos_post_system_message(uuid, text, text, jsonb) TO service_role;

COMMENT ON FUNCTION public.raos_post_system_message(uuid, text, text, jsonb) IS
  'Post system-generated message ke chat room. Dipanggil dari GAS/backend via service_role. sender_id=NULL, type=system. Metadata JSONB di-embed sebagai HTML comment di awal content untuk parsing UI.';

-- ── 3) RPC raos_resolve_saldo_room ─────────────────────────────
-- Cari chat_rooms.id untuk "Pengisian Saldo — <cabang>" per branch_id.
-- Return NULL kalau tidak ketemu.

CREATE OR REPLACE FUNCTION public.raos_resolve_saldo_room(p_branch_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id FROM chat_rooms
  WHERE branch_id = p_branch_id
    AND is_active = true
    AND (
      lower(name) LIKE '%pengisian saldo%'
      OR lower(name) LIKE '%isi saldo%'
    )
  ORDER BY created_at ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.raos_resolve_saldo_room(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.raos_resolve_saldo_room(uuid) TO service_role, authenticated;

-- ── 4) RPC raos_resolve_driver_room ────────────────────────────
-- Cari chat_rooms.id untuk "Driver — <cabang>" per branch_id.

CREATE OR REPLACE FUNCTION public.raos_resolve_driver_room(p_branch_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id FROM chat_rooms
  WHERE branch_id = p_branch_id
    AND is_active = true
    AND lower(name) LIKE 'driver%'
  ORDER BY created_at ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.raos_resolve_driver_room(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.raos_resolve_driver_room(uuid) TO service_role, authenticated;

-- ── 5) RPC raos_resolve_announcement_room ──────────────────────
-- Room "Pengumuman" global (branch_id NULL, category='operasional').

CREATE OR REPLACE FUNCTION public.raos_resolve_announcement_room()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id FROM chat_rooms
  WHERE branch_id IS NULL
    AND is_active = true
    AND lower(name) = 'pengumuman'
  ORDER BY created_at ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.raos_resolve_announcement_room() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.raos_resolve_announcement_room() TO service_role, authenticated;

-- ── 6) RPC raos_resolve_private_room ───────────────────────────
-- Cari/create chat pribadi untuk user tertentu (untuk notif payslip individu).
-- Room "pribadi" antara direksi & staff — pola nama "<Direksi> & <Staff>".
--
-- Kalau tidak ketemu, return NULL — caller bisa fallback ke announcement room.
-- (Auto-create direksi-staff room bukan scope migration ini.)

CREATE OR REPLACE FUNCTION public.raos_resolve_private_room(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT r.id
  FROM chat_rooms r
  JOIN chat_room_members m ON m.room_id = r.id
  WHERE m.user_id = p_user_id
    AND r.category = 'pribadi'
    AND r.is_active = true
  ORDER BY r.created_at ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.raos_resolve_private_room(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.raos_resolve_private_room(uuid) TO service_role, authenticated;

-- ============================================================
-- SANITY TEST (jalankan manual setelah apply):
-- ============================================================
-- SELECT raos_resolve_saldo_room('029723bc-f500-464f-bbc6-f65a8160cc7b');  -- Batam airport
-- SELECT raos_resolve_announcement_room();
-- SELECT raos_post_system_message(
--   raos_resolve_announcement_room(),
--   '🔧 Test system message dari migration raos_073.',
--   'test',
--   '{"source": "manual_test"}'::jsonb
-- );
-- SELECT id, type, content, created_at FROM chat_messages
-- WHERE type='system' ORDER BY created_at DESC LIMIT 5;
