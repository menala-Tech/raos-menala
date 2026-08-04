-- raos_069: Expand user_profiles.source enum untuk include driver sources.
--
-- Bug: provisionDriverAuth_ di GAS 12_driver_airport_sync + 17_driver_external_sync
-- coba INSERT dengan source='ssot_driver_airport' atau 'ssot_driver_external',
-- yang sebelumnya BUKAN valid value → CHECK constraint 23514 gagal, semua
-- driver auth provisioning error 100%.
--
-- Terdeteksi dari monitor system_log Admin Console Portal Rifim OS
-- (sesi 2026-08-04) — puluhan error identik "Failing row contains ... driver".
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_source_check;
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_source_check
  CHECK (source = ANY (ARRAY[
    'manual'::text,
    'ssot_master_staff'::text,
    'ssot_driver_airport'::text,
    'ssot_driver_external'::text
  ]));
