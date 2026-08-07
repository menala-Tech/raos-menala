-- ============================================================
-- raos_076 — Skip approval flow (poin 2+6 requirement 2026-08-07)
-- ============================================================
--
-- Konteks: SaldoRequestCard tidak lagi expose tombol Setujui/Tolak untuk
-- koord/admin/mgmt/direksi. Finance sekarang boleh mark_paid langsung
-- dari status='pending' (skip approval step).
--
-- Behavior change TUNGGAL:
--   OLD: hanya status='approved' yang processable
--   NEW: status IN ('pending','approved') processable
--
-- Backward compat penuh:
--   - Legacy request status='approved' tetap bisa di-mark_paid
--   - status='rejected' tetap ditolak (sekarang label 'not_processable')
--   - status='cancelled' tetap ditolak
--   - is_processed=true tetap 'already_processed'
--
-- Response `not_approved` di-rename jadi `not_processable` (semantik lebih
-- akurat karena tidak hanya untuk pending yang belum approved).
-- Frontend Finance handle kedua label untuk toleran deployment drift.
--
-- Source RPC: canonical dari `pg_get_functiondef` prod 2026-08-07
-- (setelah raos_074). Body verbatim, hanya 2 baris berubah:
--   1. IF v_request.status <> 'approved' → IF v_request.status NOT IN
--      ('pending', 'approved')
--   2. 'not_approved' → 'not_processable'
--
-- Security/authorization/locking/audit tidak diubah:
--   - SECURITY DEFINER + search_path='public' tetap
--   - JWT role check (service_role bypass) tetap
--   - processor_id vs auth.uid() check tetap
--   - user_profiles role gate (admin/management/direksi/direktur) tetap
--   - SELECT ... FOR UPDATE tetap
--   - already_processed guard tetap
-- ============================================================

CREATE OR REPLACE FUNCTION public.raos_saldo_mark_paid(p_request_id uuid, p_processor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_request public.raos_saldo_requests%ROWTYPE;
  v_role text;
  v_caller_id uuid := auth.uid();
  v_jwt_role text := COALESCE(current_setting('request.jwt.claim.role', true), '');
BEGIN
  IF p_request_id IS NULL OR p_processor_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input: request_id dan processor_id wajib';
  END IF;

  IF v_jwt_role <> 'service_role' AND v_caller_id IS DISTINCT FROM p_processor_id THEN
    RAISE EXCEPTION 'processor_mismatch: processor_id harus sama dengan auth.uid()';
  END IF;

  SELECT role
    INTO v_role
    FROM public.user_profiles
   WHERE id = p_processor_id
     AND is_active = true;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'processor_not_found: profil processor aktif tidak ditemukan';
  END IF;
  IF lower(v_role) NOT IN ('admin', 'management', 'direksi', 'direktur') THEN
    RAISE EXCEPTION 'role_not_allowed: butuh admin/management/direksi';
  END IF;

  SELECT *
    INTO v_request
    FROM public.raos_saldo_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found', 'request_id', p_request_id);
  END IF;

  IF v_request.is_processed THEN
    RETURN jsonb_build_object('status', 'already_processed', 'row', to_jsonb(v_request));
  END IF;

  -- CHANGE raos_076 (poin 2+6): allow status IN ('pending','approved').
  -- Sebelumnya hanya 'approved' (raos_074). Rejected/cancelled tetap blocked.
  IF v_request.status NOT IN ('pending', 'approved') THEN
    RETURN jsonb_build_object(
      'status', 'not_processable',
      'current_status', v_request.status,
      'row', to_jsonb(v_request)
    );
  END IF;

  UPDATE public.raos_saldo_requests
     SET is_processed = true,
         processed_at = now(),
         processed_by = p_processor_id,
         updated_at = now()
   WHERE id = p_request_id
   RETURNING * INTO v_request;

  RETURN jsonb_build_object('status', 'updated', 'row', to_jsonb(v_request));
END;
$function$;
