-- raos_056_role_driver_manager
-- Menambah role `driver_manager` ke platform.
--
-- Cakupan akses:
--   - Kelola raos_drivers untuk cabang di scope-nya (INSERT/UPDATE/DELETE).
--   - Baca + tulis raos_driver_queue via policy scoped yang sudah ada
--     (raos_driver_queue_scoped_all sudah pakai is_branch_in_scope,
--     driver_manager otomatis inherit karena punya branch_id).
--   - Tidak akses raos_saldo_requests atau raos_attendance di luar
--     scope staff level (submit sendiri, view own).
--
-- Scope branch mengikuti helper `is_branch_in_scope` yang sudah ada —
-- driver_manager dibatasi ke cabang sendiri + parent/descendant, TIDAK
-- bypass global seperti admin/mgmt/direksi.

-- 1) Extend CHECK constraint di user_profiles.role
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role = ANY (ARRAY['direksi','admin','management','koordinator','staff','driver_manager']));

COMMENT ON CONSTRAINT user_profiles_role_check ON public.user_profiles IS
  'Roles RAOS: direksi, admin, management, koordinator, staff, driver_manager (sesi 22)';

-- 2) Policy: driver_manager boleh manage raos_drivers untuk cabang scope-nya.
--    Tanpa policy ini, driver_manager cuma bisa read (via raos_drivers_read_scoped).
DROP POLICY IF EXISTS raos_drivers_dm_manage ON public.raos_drivers;
CREATE POLICY raos_drivers_dm_manage ON public.raos_drivers
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (
    (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'driver_manager'
    AND is_branch_in_scope(branch_id)
  )
  WITH CHECK (
    (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'driver_manager'
    AND is_branch_in_scope(branch_id)
  );

-- 3) raos_driver_queue policy sudah kompatibel (scoped by is_branch_in_scope,
--    tidak filter by role). Tidak perlu policy tambahan.
