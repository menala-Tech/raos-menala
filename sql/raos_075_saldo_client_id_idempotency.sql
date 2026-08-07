-- F-05/F-10: one idempotency key and one transaction for saldo request + chat.

ALTER TABLE public.raos_saldo_requests
  ADD COLUMN IF NOT EXISTS client_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS raos_saldo_requests_client_id_uidx
  ON public.raos_saldo_requests (client_id)
  WHERE client_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.raos_saldo_submit(
  p_client_id uuid,
  p_branch_id uuid,
  p_nominal numeric,
  p_room_id uuid,
  p_driver_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile public.user_profiles%ROWTYPE;
  v_driver public.raos_drivers%ROWTYPE;
  v_branch public.branches%ROWTYPE;
  v_room public.chat_rooms%ROWTYPE;
  v_request public.raos_saldo_requests%ROWTYPE;
  v_message_id uuid;
  v_request_no text;
  v_content jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated: session Supabase wajib';
  END IF;
  IF p_client_id IS NULL OR p_branch_id IS NULL OR p_driver_id IS NULL OR p_nominal IS NULL OR p_nominal <= 0 THEN
    RAISE EXCEPTION 'invalid_input: client_id, branch_id, driver_id, dan nominal positif wajib';
  END IF;

  SELECT * INTO v_profile
    FROM public.user_profiles
   WHERE id = v_user_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found: profil aktif tidak ditemukan';
  END IF;
  IF lower(v_profile.role) NOT IN ('staff', 'koordinator', 'admin', 'management', 'direksi', 'direktur') THEN
    RAISE EXCEPTION 'role_not_allowed: role tidak boleh submit saldo';
  END IF;
  IF NOT public.is_branch_in_scope(p_branch_id) THEN
    RAISE EXCEPTION 'branch_not_allowed: cabang di luar scope user';
  END IF;

  SELECT * INTO v_branch FROM public.branches WHERE id = p_branch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch_not_found: cabang tidak ditemukan';
  END IF;

  SELECT * INTO v_driver
    FROM public.raos_drivers
   WHERE id = p_driver_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'driver_not_found: driver aktif tidak ditemukan';
  END IF;

  -- Prefer the canonical saldo room for the branch. The supplied room is only
  -- an in-branch fallback, so a request cannot be routed to an arbitrary room.
  SELECT * INTO v_room
    FROM public.chat_rooms
   WHERE branch_id = p_branch_id
     AND is_active = true
     AND (name ILIKE '%pengisian saldo%' OR name ILIKE '%isi saldo%')
   ORDER BY created_at
   LIMIT 1;

  IF NOT FOUND AND p_room_id IS NOT NULL THEN
    SELECT * INTO v_room
      FROM public.chat_rooms
     WHERE id = p_room_id
       AND branch_id = p_branch_id
       AND is_active = true;
  END IF;
  IF v_room.id IS NULL THEN
    RAISE EXCEPTION 'saldo_room_not_found: room saldo aktif untuk cabang tidak ditemukan';
  END IF;

  v_request_no := 'SLD-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS-') ||
                  upper(substr(replace(p_client_id::text, '-', ''), 1, 6));

  INSERT INTO public.raos_saldo_requests (
    request_no, client_id, staff_id, branch_id, nominal, status,
    chat_room_id, driver_id, driver_login_id, driver_name
  )
  VALUES (
    v_request_no, p_client_id, v_user_id, p_branch_id, p_nominal, 'pending',
    v_room.id, v_driver.id, v_driver.driver_id, v_driver.name
  )
  ON CONFLICT (client_id) WHERE client_id IS NOT NULL DO NOTHING
  RETURNING * INTO v_request;

  IF NOT FOUND THEN
    SELECT * INTO v_request
      FROM public.raos_saldo_requests
     WHERE client_id = p_client_id;
    IF NOT FOUND OR v_request.staff_id IS DISTINCT FROM v_user_id THEN
      RAISE EXCEPTION 'idempotency_conflict: client_id dimiliki user lain';
    END IF;
    RETURN jsonb_build_object('status', 'already_exists', 'row', to_jsonb(v_request));
  END IF;

  v_content := jsonb_build_object(
    'request_id', v_request.id,
    'request_no', v_request.request_no,
    'staff_name', v_profile.full_name,
    'branch_slug', v_branch.slug,
    'branch_name', v_branch.name,
    'branch_id', v_branch.id,
    'nominal', v_request.nominal,
    'status', 'pending',
    'requested_at', v_request.requested_at,
    'driver_login_id', v_driver.driver_id,
    'driver_name', v_driver.name,
    'driver_branch_name', (
      SELECT b.name FROM public.branches b WHERE b.id = v_driver.branch_id
    )
  );

  INSERT INTO public.chat_messages (room_id, sender_id, type, content, client_id)
  VALUES (v_room.id, v_user_id, 'saldo_request', v_content::text, p_client_id)
  RETURNING id INTO v_message_id;

  UPDATE public.raos_saldo_requests
     SET chat_message_id = v_message_id,
         updated_at = now()
   WHERE id = v_request.id
   RETURNING * INTO v_request;

  RETURN jsonb_build_object('status', 'created', 'row', to_jsonb(v_request));
END;
$$;

REVOKE ALL ON FUNCTION public.raos_saldo_submit(uuid, uuid, numeric, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.raos_saldo_submit(uuid, uuid, numeric, uuid, uuid) TO authenticated;

