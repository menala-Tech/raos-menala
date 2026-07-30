-- raos_057_driver_role_login
--
-- Menambah role `driver` ke platform + link user_profile ↔ raos_drivers,
-- supaya driver bisa login PWA dengan barcode/PIN dan hanya melihat
-- data cabang & antrean mereka sendiri.
--
-- Scope perubahan:
--   1. Extend user_profiles.role CHECK: tambah 'driver'
--   2. Kolom baru user_profiles.driver_id UUID (nullable, FK ke
--      raos_drivers.id) — mengikat account driver ke rekaman driver.
--   3. Helper get_my_driver_branch() SECURITY DEFINER — ambil branch_id
--      dari raos_drivers via driver_id link. Dipakai policy driver-scoped.
--   4. Policy raos_driver_queue_driver_read — driver hanya lihat baris
--      antrean untuk cabang dia (bukan tulis; mereka tidak bisa
--      manipulate antrean).
--   5. Policy raos_saldo_requests_driver_read — driver bisa lihat
--      pengajuan saldo yang di-address ke dirinya (driver_id sama).
--
-- Provisioning auth user untuk driver dilakukan admin manual dari
-- /drivers page (planned) — out of scope migration ini.

-- 1) Extend role CHECK constraint
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role = ANY (ARRAY[
    'direksi', 'admin', 'management', 'koordinator', 'staff',
    'driver_manager', 'driver'
  ]));

COMMENT ON CONSTRAINT user_profiles_role_check ON public.user_profiles IS
  'Roles RAOS: direksi, admin, management, koordinator, staff, driver_manager, driver (sesi 22)';

-- 2) Kolom link ke raos_drivers.id
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES public.raos_drivers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS user_profiles_driver_id_idx
  ON public.user_profiles(driver_id) WHERE driver_id IS NOT NULL;

COMMENT ON COLUMN public.user_profiles.driver_id IS
  'Link ke raos_drivers.id kalau user profile ini punya role=driver. NULL untuk role lain.';

-- 3) Helper get_my_driver_branch() — untuk RLS driver-scoped
CREATE OR REPLACE FUNCTION public.get_my_driver_branch()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
STABLE
AS $$
  SELECT d.branch_id
    FROM public.user_profiles p
    JOIN public.raos_drivers d ON d.id = p.driver_id
   WHERE p.id = auth.uid()
   LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_driver_branch() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_driver_branch() TO authenticated;

-- 4) raos_driver_queue: driver bisa read baris cabang dia (read-only).
--    Bukan tulis — antrean dikelola staff/koordinator via /antrian-driver.
DROP POLICY IF EXISTS raos_driver_queue_driver_read ON public.raos_driver_queue;
CREATE POLICY raos_driver_queue_driver_read ON public.raos_driver_queue
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'driver'
    AND branch_id = public.get_my_driver_branch()
  );

-- 5) raos_saldo_requests: driver hanya lihat pengajuan untuk dirinya.
--    Match via driver_id (uuid FK ke raos_drivers.id).
DROP POLICY IF EXISTS raos_saldo_requests_driver_own ON public.raos_saldo_requests;
CREATE POLICY raos_saldo_requests_driver_own ON public.raos_saldo_requests
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'driver'
    AND driver_id = (SELECT driver_id FROM public.user_profiles WHERE id = auth.uid())
  );
