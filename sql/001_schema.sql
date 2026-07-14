-- ============================================================
-- RAOS — Rifim Airport Operation System
-- Schema: 001_schema.sql
-- ============================================================

-- Enable UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- MASTER TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,          -- T1, T2, T3
  name TEXT NOT NULL,                  -- Terminal 1, dll
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pickup_points (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID REFERENCES branches(id),
  code TEXT NOT NULL,                  -- T1.PP1, T1.PP2
  name TEXT NOT NULL,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  radius_meters INT DEFAULT 50,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,                  -- Pagi, Siang, Malam
  start_time TIME NOT NULL,            -- 07:00
  end_time TIME NOT NULL,              -- 15:00
  tolerance_minutes INT DEFAULT 15,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS system_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- USER & AUTH
-- ============================================================

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_id TEXT UNIQUE NOT NULL,       -- ID STAFF
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('direksi','admin','koordinator','staff')),
  branch_id UUID REFERENCES branches(id),
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DRIVERS
-- ============================================================

CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  vehicle_type TEXT,
  vehicle_plate TEXT,
  branch_id UUID REFERENCES branches(id),
  barcode TEXT UNIQUE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SCAN ORDERS (OVS - Order Validation System)
-- ============================================================

CREATE TABLE IF NOT EXISTS scan_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scan_id TEXT UNIQUE NOT NULL,        -- ID Scan unik
  driver_id UUID REFERENCES drivers(id),
  staff_id UUID REFERENCES user_profiles(id),
  pickup_point_id UUID REFERENCES pickup_points(id),
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','valid','rejected')),
  koordinator_id UUID REFERENCES user_profiles(id),
  validated_at TIMESTAMPTZ,
  admin_checked BOOLEAN DEFAULT FALSE,
  admin_id UUID REFERENCES user_profiles(id),
  admin_checked_at TIMESTAMPTZ,
  gmv DECIMAL(15,2) DEFAULT 0,
  incentive DECIMAL(15,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ATTENDANCE (ABSENSI)
-- ============================================================

CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id UUID REFERENCES user_profiles(id),
  branch_id UUID REFERENCES branches(id),
  pickup_point_id UUID REFERENCES pickup_points(id),
  shift_id UUID REFERENCES shifts(id),
  date DATE NOT NULL,
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  check_in_lat DECIMAL(10,8),
  check_in_lng DECIMAL(11,8),
  check_out_lat DECIMAL(10,8),
  check_out_lng DECIMAL(11,8),
  selfie_in_url TEXT,
  selfie_out_url TEXT,
  status TEXT DEFAULT 'hadir' CHECK (status IN ('hadir','terlambat','tidak_hadir','sakit','izin')),
  is_location_valid BOOLEAN DEFAULT FALSE,
  auto_checkout BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, date)
);

-- ============================================================
-- KPI TARGETS
-- ============================================================

CREATE TABLE IF NOT EXISTS kpi_targets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id UUID REFERENCES user_profiles(id),
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INT NOT NULL,
  target_scan INT DEFAULT 0,
  target_gmv DECIMAL(15,2) DEFAULT 0,
  target_attendance_pct DECIMAL(5,2) DEFAULT 100,
  target_kpi_pct DECIMAL(5,2) DEFAULT 100,
  actual_scan INT DEFAULT 0,
  actual_gmv DECIMAL(15,2) DEFAULT 0,
  actual_attendance_pct DECIMAL(5,2) DEFAULT 0,
  actual_kpi_pct DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, month, year)
);

-- ============================================================
-- CHAT
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('umum','lokasi','operasional','driver_support','proyek')),
  branch_id UUID REFERENCES branches(id),
  description TEXT,
  auto_delete_days INT,               -- null = tidak hapus otomatis
  created_by UUID REFERENCES user_profiles(id),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_room_members (
  room_id UUID REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  can_send_message BOOLEAN DEFAULT TRUE,
  can_send_media BOOLEAN DEFAULT TRUE,
  can_send_location BOOLEAN DEFAULT TRUE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY(room_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES user_profiles(id),
  type TEXT DEFAULT 'text' CHECK (type IN ('text','image','video','file','location','contact','poll')),
  content TEXT,
  media_url TEXT,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  is_pinned BOOLEAN DEFAULT FALSE,
  reply_to UUID REFERENCES chat_messages(id),
  auto_delete_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LOGS
-- ============================================================

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES user_profiles(id),
  action TEXT NOT NULL,               -- login, scan, absensi, edit, hapus, export
  detail TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL,                 -- import, notifikasi, backup, error, cron
  process TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success','error','warning')),
  detail TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES user_profiles(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL,                 -- absensi, scan, kpi, pengumuman, chat
  is_read BOOLEAN DEFAULT FALSE,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_scan_orders_staff ON scan_orders(staff_id);
CREATE INDEX IF NOT EXISTS idx_scan_orders_status ON scan_orders(status);
CREATE INDEX IF NOT EXISTS idx_scan_orders_date ON scan_orders(scanned_at);
CREATE INDEX IF NOT EXISTS idx_attendance_staff_date ON attendance(staff_id, date);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_room ON chat_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
