-- ─────────────────────────────────────────────────────────────────────────
-- RAOS 059 — Fix batch 30 Juli 2026 (sore):
--   B3 RLS chat_rooms bocor: policy rooms_read_member pakai
--      `branch_id IS NULL` sebagai kondisi bocor, tapi SEMUA room pribadi
--      punya branch_id NULL — efeknya user bisa lihat SEMUA room pribadi
--      orang lain di list chat. Fix: kategori 'pribadi' STRICTLY
--      membership-based; room global tetap terlihat authenticated.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS rooms_read_member ON public.chat_rooms;

CREATE POLICY rooms_read_member
  ON public.chat_rooms FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND (
      id IN (SELECT room_id FROM chat_room_members WHERE user_id = auth.uid())
      OR (branch_id IS NULL AND category IS DISTINCT FROM 'pribadi')
      OR (branch_id IS NOT NULL AND is_branch_in_scope(branch_id))
    )
  );
