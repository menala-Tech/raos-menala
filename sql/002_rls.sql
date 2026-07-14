-- ============================================================
-- RAOS — Row Level Security Policies
-- ============================================================

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE pickup_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

-- Helper: ambil role user saat ini
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_my_branch()
RETURNS UUID AS $$
  SELECT branch_id FROM user_profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER;

-- ============================================================
-- USER PROFILES
-- ============================================================
CREATE POLICY "user dapat lihat profil sendiri"
  ON user_profiles FOR SELECT USING (id = auth.uid());

CREATE POLICY "admin dapat lihat semua profil"
  ON user_profiles FOR SELECT USING (get_my_role() IN ('admin','direksi'));

CREATE POLICY "user dapat update profil sendiri"
  ON user_profiles FOR UPDATE USING (id = auth.uid());

CREATE POLICY "admin dapat kelola profil"
  ON user_profiles FOR ALL USING (get_my_role() IN ('admin','direksi'));

-- ============================================================
-- BRANCHES & PICKUP POINTS (semua bisa baca)
-- ============================================================
CREATE POLICY "semua user bisa baca cabang"
  ON branches FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "semua user bisa baca pickup points"
  ON pickup_points FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "semua user bisa baca shift"
  ON shifts FOR SELECT USING (auth.uid() IS NOT NULL);

-- ============================================================
-- ATTENDANCE
-- ============================================================
CREATE POLICY "staff lihat absensi sendiri"
  ON attendance FOR SELECT USING (staff_id = auth.uid());

CREATE POLICY "koordinator & admin lihat absensi cabang"
  ON attendance FOR SELECT USING (
    get_my_role() IN ('koordinator','admin','direksi')
    AND branch_id = get_my_branch()
  );

CREATE POLICY "direksi lihat semua absensi"
  ON attendance FOR SELECT USING (get_my_role() = 'direksi');

CREATE POLICY "staff bisa input absensi sendiri"
  ON attendance FOR INSERT WITH CHECK (staff_id = auth.uid());

CREATE POLICY "staff bisa update absensi sendiri hari ini"
  ON attendance FOR UPDATE USING (
    staff_id = auth.uid() AND date = CURRENT_DATE
  );

-- ============================================================
-- SCAN ORDERS
-- ============================================================
CREATE POLICY "staff lihat scan sendiri"
  ON scan_orders FOR SELECT USING (staff_id = auth.uid());

CREATE POLICY "koordinator lihat scan cabang"
  ON scan_orders FOR SELECT USING (
    get_my_role() IN ('koordinator','admin','direksi')
  );

CREATE POLICY "staff bisa input scan"
  ON scan_orders FOR INSERT WITH CHECK (staff_id = auth.uid());

CREATE POLICY "koordinator bisa validasi scan"
  ON scan_orders FOR UPDATE USING (
    get_my_role() IN ('koordinator','admin','direksi')
  );

-- ============================================================
-- DRIVERS
-- ============================================================
CREATE POLICY "semua user bisa lihat driver aktif"
  ON drivers FOR SELECT USING (
    auth.uid() IS NOT NULL AND is_active = TRUE
  );

CREATE POLICY "admin kelola driver"
  ON drivers FOR ALL USING (get_my_role() IN ('admin','direksi'));

-- ============================================================
-- KPI TARGETS
-- ============================================================
CREATE POLICY "staff lihat kpi sendiri"
  ON kpi_targets FOR SELECT USING (staff_id = auth.uid());

CREATE POLICY "koordinator & admin lihat kpi"
  ON kpi_targets FOR SELECT USING (
    get_my_role() IN ('koordinator','admin','direksi')
  );

CREATE POLICY "admin kelola kpi"
  ON kpi_targets FOR ALL USING (get_my_role() IN ('admin','direksi'));

-- ============================================================
-- CHAT
-- ============================================================
CREATE POLICY "member bisa baca pesan room"
  ON chat_messages FOR SELECT USING (
    room_id IN (
      SELECT room_id FROM chat_room_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "member bisa kirim pesan"
  ON chat_messages FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND room_id IN (
      SELECT room_id FROM chat_room_members
      WHERE user_id = auth.uid() AND can_send_message = TRUE
    )
  );

CREATE POLICY "user bisa lihat room yang diikuti"
  ON chat_rooms FOR SELECT USING (
    id IN (SELECT room_id FROM chat_room_members WHERE user_id = auth.uid())
  );

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE POLICY "user lihat notifikasi sendiri"
  ON notifications FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user update notifikasi sendiri"
  ON notifications FOR UPDATE USING (user_id = auth.uid());

-- ============================================================
-- LOGS
-- ============================================================
CREATE POLICY "admin bisa baca activity logs"
  ON activity_logs FOR SELECT USING (
    get_my_role() IN ('admin','direksi')
  );

CREATE POLICY "sistem bisa insert logs"
  ON activity_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "admin bisa baca system logs"
  ON system_logs FOR SELECT USING (get_my_role() IN ('admin','direksi'));

-- ============================================================
-- SYSTEM CONFIG
-- ============================================================
CREATE POLICY "semua user bisa baca config"
  ON system_config FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "admin bisa kelola config"
  ON system_config FOR ALL USING (get_my_role() IN ('admin','direksi'));
