-- raos_067_driver_type_column.sql
--
-- Feedback 1 Agu 2026: tambah kolom driver_type di raos_drivers untuk mirror
-- kolom D "Airport" di sheet SSOT. Populate 3 value: 'airport' (dari SSOT
-- driver airport), 'external' (dari SSOT driver external Batam/Jambi Luar),
-- 'non-airport' (manual entries lain).

ALTER TABLE public.raos_drivers
  ADD COLUMN IF NOT EXISTS driver_type text;

ALTER TABLE public.raos_drivers
  DROP CONSTRAINT IF EXISTS raos_drivers_driver_type_check;
ALTER TABLE public.raos_drivers
  ADD CONSTRAINT raos_drivers_driver_type_check
  CHECK (driver_type IS NULL OR driver_type = ANY (ARRAY['airport', 'external', 'non-airport']));

COMMENT ON COLUMN public.raos_drivers.driver_type IS
  'Klasifikasi driver mirror kolom D "Airport" di sheet SSOT: airport (bandara), external (Batam/Jambi Luar), non-airport (lain). NULL untuk row lama sebelum backfill.';

-- Backfill baris existing berdasarkan source
UPDATE public.raos_drivers SET driver_type = 'airport'
 WHERE source = 'ssot_driver_airport' AND driver_type IS NULL;

UPDATE public.raos_drivers SET driver_type = 'external'
 WHERE source = 'ssot_driver_external' AND driver_type IS NULL;

UPDATE public.raos_drivers SET driver_type = 'non-airport'
 WHERE source = 'manual' AND driver_type IS NULL;

CREATE INDEX IF NOT EXISTS raos_drivers_driver_type_idx
  ON public.raos_drivers(driver_type) WHERE driver_type IS NOT NULL;
