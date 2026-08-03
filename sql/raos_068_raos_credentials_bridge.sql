-- raos_068: Tabel kredensial RAOS/Rifim-OS terpisah + RPC bridge login
--
-- TUJUAN: RAOS PWA + Rifim-OS Portal punya PIN + ID Staff sendiri (kolom I/J
-- sheet SSOT baru), TERPISAH dari PIN existing kolom H yang dipakai PWA lain
-- (rifim-isi-saldo, radms-driver). Supabase Auth password TETAP = SSOT PIN
-- kolom H, jadi PWA lain tidak terganggu.
--
-- FLOW LOGIN RAOS/Rifim-OS:
-- 1. Client input email/RAOS_ID + RAOS_PIN
-- 2. RPC raos_verify_and_bridge → verify RAOS_PIN, kalau match return
--    email + ssot_pin (dari mirror kolom H, unavoidable karena Supabase Auth
--    butuh plaintext password untuk signInWithPassword)
-- 3. Client panggil supabase.auth.signInWithPassword transparent
--
-- SECURITY: raos_credentials.ssot_pin & raos_pin plaintext (mirror kolom H
-- sheet SSOT yang juga plaintext). RLS strict: hanya service_role/admin bisa
-- read raw table; login lewat SECURITY DEFINER RPC saja. Tech debt: migrate
-- ke bcrypt raos_pin + vault-encrypted ssot_pin di iterasi berikut.

CREATE TABLE IF NOT EXISTS public.raos_credentials (
  user_id          uuid PRIMARY KEY REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  raos_staff_code  text UNIQUE,
  raos_pin         text NOT NULL,
  ssot_pin         text,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.raos_credentials IS 'RAOS/Rifim-OS auth bridge — mirror kolom I & J sheet SSOT + kolom H. Sync 1-arah dari GAS 14_raos_credentials_sync.gs. Login PWA lain (isi-saldo, radms-driver) tidak baca tabel ini — mereka tetap pakai Supabase Auth langsung.';
COMMENT ON COLUMN public.raos_credentials.raos_staff_code IS 'Dari sheet SSOT kolom J. Login RAOS/Portal bisa pakai ini ATAU email.';
COMMENT ON COLUMN public.raos_credentials.raos_pin IS 'Dari sheet SSOT kolom I. Yang user ketik saat login RAOS/Portal.';
COMMENT ON COLUMN public.raos_credentials.ssot_pin IS 'Mirror kolom H sheet SSOT (SSOT PIN yg dipakai PWA lain + Supabase Auth). Dipakai RPC bridge untuk sign-in transparent.';

ALTER TABLE public.raos_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS raos_credentials_admin_read ON public.raos_credentials;
CREATE POLICY raos_credentials_admin_read ON public.raos_credentials
  FOR SELECT USING (get_my_role() = ANY (ARRAY['admin','direksi','management']));

CREATE OR REPLACE FUNCTION public.raos_verify_and_bridge(
  p_login_id text,
  p_raos_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
  v_email text;
  v_ssot_pin text;
  v_full_name text;
  v_role text;
  v_is_active boolean;
  v_stored_pin text;
BEGIN
  SELECT rc.user_id, rc.ssot_pin, rc.raos_pin
    INTO v_user_id, v_ssot_pin, v_stored_pin
  FROM public.raos_credentials rc
  WHERE rc.raos_staff_code = p_login_id
  LIMIT 1;

  IF v_user_id IS NULL THEN
    SELECT au.id INTO v_user_id FROM auth.users au WHERE au.email = lower(p_login_id) LIMIT 1;
    IF v_user_id IS NOT NULL THEN
      SELECT rc.ssot_pin, rc.raos_pin INTO v_ssot_pin, v_stored_pin
      FROM public.raos_credentials rc WHERE rc.user_id = v_user_id;
    END IF;
  END IF;

  IF v_user_id IS NULL OR v_stored_pin IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found',
      'message', 'ID/email tidak terdaftar di sistem RAOS. Minta admin isi RAOS PIN di sheet SSOT.');
  END IF;

  IF v_stored_pin <> p_raos_pin THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_pin',
      'message', 'RAOS PIN salah.');
  END IF;

  SELECT up.full_name, up.role, up.is_active, au.email
    INTO v_full_name, v_role, v_is_active, v_email
  FROM public.user_profiles up
  JOIN auth.users au ON au.id = up.id
  WHERE up.id = v_user_id;

  IF NOT v_is_active THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'inactive',
      'message', 'Akun Anda nonaktif.');
  END IF;

  IF v_ssot_pin IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_ssot_pin',
      'message', 'SSOT PIN kosong — sync ulang dari GAS.');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'email', v_email,
    'ssot_pin', v_ssot_pin,
    'user_id', v_user_id,
    'full_name', v_full_name,
    'role', v_role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.raos_verify_and_bridge(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.raos_verify_and_bridge(text, text) TO anon, authenticated;
