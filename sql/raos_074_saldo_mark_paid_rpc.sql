-- F-04: atomic, guarded Finance mark-paid transition.

CREATE OR REPLACE FUNCTION public.raos_saldo_mark_paid(
  p_request_id uuid,
  p_processor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.raos_saldo_requests%ROWTYPE;
  v_role text;
  v_caller_id uuid := auth.uid();
  v_jwt_role text := COALESCE(current_setting('request.jwt.claim.role', true), '');
BEGIN
  IF p_request_id IS NULL OR p_processor_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input: request_id dan processor_id wajib';
  END IF;

  -- Authenticated callers cannot attribute processing to another user.
  -- The GAS proxy calls with service_role only after it has verified the
  -- user's Supabase access token and derived p_processor_id from token.sub.
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

  IF v_request.status <> 'approved' THEN
    RETURN jsonb_build_object(
      'status', 'not_approved',
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
$$;

REVOKE ALL ON FUNCTION public.raos_saldo_mark_paid(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.raos_saldo_mark_paid(uuid, uuid) TO authenticated, service_role;

