-- raos_080_driver_email_login
-- Driver PWA login contract:
--   - user enters ID Driver + email used on the driver's phone
--   - first successful login binds that email to raos_drivers.login_email
--   - subsequent logins must use the same bound email
--
-- IMPORTANT: frontend still authenticates the already-provisioned driver
-- auth.users identity (<driver_id>@driver.rifim.local). This migration does
-- not expose or store an additional password. Email is an identity binding.

ALTER TABLE public.raos_drivers
  ADD COLUMN IF NOT EXISTS login_email text;

COMMENT ON COLUMN public.raos_drivers.login_email IS
  'Email yang dibinding untuk login PWA driver. First successful driver session may bind once; subsequent login must match.';

CREATE UNIQUE INDEX IF NOT EXISTS raos_drivers_login_email_uidx
  ON public.raos_drivers (lower(login_email))
  WHERE login_email IS NOT NULL AND btrim(login_email) <> '';

-- Pre-auth check. Returns only state, never driver/profile secrets.
CREATE OR REPLACE FUNCTION public.raos_verify_driver_email(
  p_driver_id text,
  p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver public.raos_drivers%ROWTYPE;
  v_input_email text := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF btrim(coalesce(p_driver_id, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'driver_id_required');
  END IF;

  IF v_input_email = '' OR v_input_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_email');
  END IF;

  SELECT * INTO v_driver
  FROM public.raos_drivers
  WHERE driver_id = btrim(p_driver_id)
    AND is_active = true
  LIMIT 1;

  IF v_driver.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'driver_not_found');
  END IF;

  IF v_driver.login_email IS NULL OR btrim(v_driver.login_email) = '' THEN
    RETURN jsonb_build_object('ok', true, 'state', 'unbound');
  END IF;

  IF lower(btrim(v_driver.login_email)) <> v_input_email THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'email_mismatch');
  END IF;

  RETURN jsonb_build_object('ok', true, 'state', 'match');
END;
$$;

REVOKE ALL ON FUNCTION public.raos_verify_driver_email(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.raos_verify_driver_email(text, text) TO anon, authenticated;

-- Authenticated one-time binding. auth.uid() must already be a driver profile
-- linked to the same raos_drivers row. Once bound, email cannot be changed by
-- this RPC; admin/SSoT can handle corrections explicitly.
CREATE OR REPLACE FUNCTION public.raos_bind_my_driver_login_email(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id uuid;
  v_existing text;
  v_input_email text := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  IF v_input_email = '' OR v_input_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_email');
  END IF;

  SELECT up.driver_id INTO v_driver_id
  FROM public.user_profiles up
  WHERE up.id = auth.uid()
    AND up.role = 'driver'
    AND up.is_active = true
  LIMIT 1;

  IF v_driver_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'driver_profile_not_found');
  END IF;

  SELECT login_email INTO v_existing
  FROM public.raos_drivers
  WHERE id = v_driver_id
    AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'driver_not_found');
  END IF;

  IF v_existing IS NOT NULL AND btrim(v_existing) <> '' THEN
    IF lower(btrim(v_existing)) = v_input_email THEN
      RETURN jsonb_build_object('ok', true, 'state', 'already_bound');
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'already_bound_other_email');
  END IF;

  BEGIN
    UPDATE public.raos_drivers
    SET login_email = v_input_email,
        updated_at = now()
    WHERE id = v_driver_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'email_already_used');
  END;

  RETURN jsonb_build_object('ok', true, 'state', 'bound');
END;
$$;

REVOKE ALL ON FUNCTION public.raos_bind_my_driver_login_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.raos_bind_my_driver_login_email(text) TO authenticated;
