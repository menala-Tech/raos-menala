-- raos_080_driver_email_login
--
-- Driver PWA login contract:
--   ID Driver + Email Driver yang sudah terdaftar di SSoT.
--
-- Email TIDAK boleh di-claim dari form login. Sumber email tetap SSoT driver
-- dan disinkronkan oleh gas/21_driver_login_email_sync.gs. Ini mencegah orang
-- yang hanya mengetahui ID Driver mengikat email miliknya sendiri.

ALTER TABLE public.raos_drivers
  ADD COLUMN IF NOT EXISTS login_email text;

COMMENT ON COLUMN public.raos_drivers.login_email IS
  'Email login driver dari SSoT (Email Driver). Read-only dari sisi PWA; dipakai bersama ID Driver untuk pre-auth verification.';

CREATE UNIQUE INDEX IF NOT EXISTS raos_drivers_login_email_uidx
  ON public.raos_drivers (lower(login_email))
  WHERE login_email IS NOT NULL AND btrim(login_email) <> '';

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
    RETURN jsonb_build_object('ok', false, 'reason', 'email_not_registered');
  END IF;

  IF lower(btrim(v_driver.login_email)) <> v_input_email THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'email_mismatch');
  END IF;

  RETURN jsonb_build_object('ok', true, 'state', 'match');
END;
$$;

REVOKE ALL ON FUNCTION public.raos_verify_driver_email(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.raos_verify_driver_email(text, text) TO anon, authenticated;

-- Hapus versi eksperimental first-login binding bila pernah dibuat di env lain.
DROP FUNCTION IF EXISTS public.raos_bind_my_driver_login_email(text);
