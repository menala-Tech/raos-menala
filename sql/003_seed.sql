-- ============================================================
-- RAOS — Seed Data
-- ============================================================

-- Branches
INSERT INTO branches (code, name) VALUES
  ('T1', 'Terminal 1'),
  ('T2', 'Terminal 2'),
  ('T3', 'Terminal 3')
ON CONFLICT (code) DO NOTHING;

-- Pickup Points
INSERT INTO pickup_points (branch_id, code, name, latitude, longitude, radius_meters)
SELECT b.id, pp.code, pp.name, pp.lat, pp.lng, 50
FROM (VALUES
  ('T1', 'T1.PP1', 'T1 Pickup Point 1', -6.125321, 106.656789),
  ('T1', 'T1.PP2', 'T1 Pickup Point 2', -6.126100, 106.657200),
  ('T1', 'T1.PP3', 'T1 Pickup Point 3', -6.127000, 106.657800),
  ('T2', 'T2.PP1', 'T2 Pickup Point 1', -6.130000, 106.660000),
  ('T2', 'T2.PP2', 'T2 Pickup Point 2', -6.130800, 106.660500),
  ('T2', 'T2.PP3', 'T2 Pickup Point 3', -6.131500, 106.661000),
  ('T3', 'T3.PP1', 'T3 Pickup Point 1', -6.135000, 106.665000),
  ('T3', 'T3.PP2', 'T3 Pickup Point 2', -6.135800, 106.665500),
  ('T3', 'T3.PP3', 'T3 Pickup Point 3', -6.136500, 106.666000)
) AS pp(branch_code, code, name, lat, lng)
JOIN branches b ON b.code = pp.branch_code
ON CONFLICT DO NOTHING;

-- Shifts
INSERT INTO shifts (name, start_time, end_time, tolerance_minutes) VALUES
  ('Pagi',  '07:00', '15:00', 15),
  ('Siang', '13:00', '21:00', 15),
  ('Malam', '21:00', '05:00', 15)
ON CONFLICT DO NOTHING;

-- System Config
INSERT INTO system_config (key, value, description) VALUES
  ('company_name',       'Menala Internasional Gemilang', 'Nama perusahaan'),
  ('currency',           'Rp',    'Mata uang'),
  ('timezone',           'Asia/Jakarta', 'Zona waktu'),
  ('attendance_tolerance','15',   'Toleransi absen (menit)'),
  ('work_days',          'Senin - Sabtu', 'Hari kerja'),
  ('fee_driver_saldo',   '5000',  'Fee saldo driver (Rp)'),
  ('potongan_bpjs',      '55000', 'Potongan BPJS (Rp)'),
  ('bonus_order_pct',    '2',     'Bonus order (%)'),
  ('kpi_kehadiran_pct',  '15',    'Bobot KPI kehadiran (%)'),
  ('kpi_order_pct',      '40',    'Bobot KPI order (%)'),
  ('kpi_gmv_pct',        '20',    'Bobot KPI GMV (%)'),
  ('app_version',        '1.0.0', 'Versi aplikasi'),
  ('auto_checkout_time', '23:59', 'Waktu auto checkout'),
  ('data_retention_days','30',    'Retensi data riwayat (hari)'),
  ('backup_time',        '02:00', 'Waktu backup otomatis')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Default chat rooms
INSERT INTO chat_rooms (name, category, description) VALUES
  ('Umum',              'umum',           'Ruang chat untuk semua staff'),
  ('Soetta T1 - Ops',   'lokasi',         'Koordinasi operasional Terminal 1'),
  ('Soetta T2 - Ops',   'lokasi',         'Koordinasi operasional Terminal 2'),
  ('Soetta T3 - Ops',   'lokasi',         'Koordinasi operasional Terminal 3'),
  ('Dukungan Driver',   'driver_support', 'Kendala driver & order'),
  ('Pengumuman',        'operasional',    'Pengumuman resmi manajemen')
ON CONFLICT DO NOTHING;
