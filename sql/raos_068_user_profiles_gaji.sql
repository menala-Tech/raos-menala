-- raos_068_user_profiles_gaji.sql
--
-- Mirror kolom C "Gaji Staff" di sheet DATABASE STAFF (SSOT MASTER DATA STAFF)
-- ke user_profiles.gaji. Feedback user 1 Agu 2026: sheet punya kolom gaji
-- tapi Supabase belum. Populate lewat sync GAS 13_staff_sync.gs.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS gaji numeric(14, 2);

COMMENT ON COLUMN public.user_profiles.gaji IS
  'Gaji pokok staff (Rp). Di-sync dari kolom C "Gaji Staff" di sheet MASTER DATA STAFF. NULL untuk role bukan staff (direksi/admin/driver) atau baris manual.';
