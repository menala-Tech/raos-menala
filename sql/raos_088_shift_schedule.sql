-- raos_088: Jadwal Kerja Shift RAOS
--
-- Menggantikan section "Lokasi & Pickup Point" di Settings (yang selama ini
-- kosong/percuma untuk 8 dari 9 cabang — cuma T1/T2/T3 Soeta yang punya
-- pickup_points, dan pickup_point_id absensi/scan toh sudah auto-detect via
-- GPS geofence, bukan dari preferensi manual ini).
--
-- Jadwal kerja per-tanggal-kalender (bukan pola mingguan berulang): 1 baris
-- per staff per tanggal, assign ke salah satu shift (Pagi/Siang/Malam dari
-- tabel shifts yang sudah ada). Semua staff 1 cabang bisa saling lihat
-- jadwal (roster board), tapi cuma admin & koordinator (scoped ke cabangnya
-- via is_branch_in_scope) yang bisa ubah. Rule: jadwal masing-masing staff
-- cuma boleh DIUBAH (bukan diisi pertama kali) 1x dalam 7 hari rolling —
-- dilacak lewat raos_shift_schedule_edit_log, ditegakkan trigger.

CREATE TABLE IF NOT EXISTS public.raos_shift_schedules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id         uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  branch_id        uuid NOT NULL REFERENCES public.branches(id),
  tanggal          date NOT NULL,
  shift_id         uuid NOT NULL REFERENCES public.shifts(id),
  created_by       uuid REFERENCES public.user_profiles(id),
  updated_by       uuid REFERENCES public.user_profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  last_changed_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, tanggal)
);

CREATE INDEX IF NOT EXISTS raos_shift_schedules_branch_tanggal_idx
  ON public.raos_shift_schedules (branch_id, tanggal);
CREATE INDEX IF NOT EXISTS raos_shift_schedules_staff_tanggal_idx
  ON public.raos_shift_schedules (staff_id, tanggal);

COMMENT ON TABLE public.raos_shift_schedules IS
  'Jadwal kerja shift per staff per tanggal kalender. Ganti section "Lokasi & Pickup Point" Settings PWA. Edit rate-limited 1x/7hari per staff via trg_raos_shift_schedule_guard.';

-- Log tiap kali jadwal seorang staff BERUBAH (update shift_id atau delete)
-- — dasar pengecekan rate limit. Bukan tabel yang diisi client langsung,
-- cuma lewat trigger (SECURITY DEFINER).
CREATE TABLE IF NOT EXISTS public.raos_shift_schedule_edit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  staff_id    uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  changed_by  uuid REFERENCES public.user_profiles(id),
  changed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS raos_shift_schedule_edit_log_staff_idx
  ON public.raos_shift_schedule_edit_log (staff_id, changed_at);

COMMENT ON TABLE public.raos_shift_schedule_edit_log IS
  'Audit trail perubahan raos_shift_schedules — dipakai trigger guard untuk rate-limit 1x perubahan/staff/7hari. Insert-only lewat trigger, tidak ada policy INSERT untuk client.';

ALTER TABLE public.raos_shift_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raos_shift_schedule_edit_log ENABLE ROW LEVEL SECURITY;

-- SELECT: siapapun yang branch-nya in-scope (staff/koordinator cabang
-- sendiri + parent/child, admin/management/direksi/direktur semua cabang)
-- — roster board 1 cabang kelihatan buat semua staff cabang itu.
DROP POLICY IF EXISTS raos_shift_schedules_select ON public.raos_shift_schedules;
CREATE POLICY raos_shift_schedules_select ON public.raos_shift_schedules
  FOR SELECT USING (public.is_branch_in_scope(branch_id));

-- Write (insert/update/delete): HANYA admin & koordinator, koordinator
-- dibatasi is_branch_in_scope (cabang sendiri + descendant/parent).
-- Management/direksi sengaja TIDAK termasuk — sesuai permintaan eksplisit
-- "edit jadwal staff hanya bisa Admin dan Koordinator".
DROP POLICY IF EXISTS raos_shift_schedules_write ON public.raos_shift_schedules;
CREATE POLICY raos_shift_schedules_write ON public.raos_shift_schedules
  FOR ALL USING (
    public.get_my_role() = ANY (ARRAY['admin','koordinator'])
    AND public.is_branch_in_scope(branch_id)
  )
  WITH CHECK (
    public.get_my_role() = ANY (ARRAY['admin','koordinator'])
    AND public.is_branch_in_scope(branch_id)
  );

DROP POLICY IF EXISTS raos_shift_schedule_edit_log_read ON public.raos_shift_schedule_edit_log;
CREATE POLICY raos_shift_schedule_edit_log_read ON public.raos_shift_schedule_edit_log
  FOR SELECT USING (public.get_my_role() = ANY (ARRAY['admin','koordinator','management','direksi','direktur']));

-- Guard trigger: set kolom audit, validasi staff milik branch yang sama,
-- dan tegakkan rate limit 1x perubahan/7hari (hanya berlaku saat shift_id
-- benar-benar berubah pada UPDATE, atau saat DELETE — INSERT pertama kali
-- untuk tanggal baru TIDAK kena limit).
CREATE OR REPLACE FUNCTION public.raos_shift_schedule_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count int;
  staff_branch uuid;
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN
    SELECT branch_id INTO staff_branch FROM public.user_profiles WHERE id = NEW.staff_id;
    IF staff_branch IS NULL OR staff_branch <> NEW.branch_id THEN
      RAISE EXCEPTION 'branch_id jadwal harus sama dengan branch_id staff';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    NEW.updated_by := auth.uid();
    NEW.updated_at := now();
    NEW.last_changed_at := now();
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.shift_id IS NOT DISTINCT FROM OLD.shift_id THEN
      RETURN NEW; -- bukan perubahan shift (mis. metadata) — lolos tanpa kena limit
    END IF;
    SELECT count(*) INTO recent_count FROM public.raos_shift_schedule_edit_log
      WHERE staff_id = OLD.staff_id AND changed_at >= now() - interval '7 days';
    IF recent_count > 0 THEN
      RAISE EXCEPTION 'rate_limited: jadwal staff ini sudah diubah dalam 7 hari terakhir, coba lagi minggu depan';
    END IF;
    INSERT INTO public.raos_shift_schedule_edit_log (staff_id, changed_by) VALUES (OLD.staff_id, auth.uid());
    NEW.updated_by := auth.uid();
    NEW.updated_at := now();
    NEW.last_changed_at := now();
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT count(*) INTO recent_count FROM public.raos_shift_schedule_edit_log
      WHERE staff_id = OLD.staff_id AND changed_at >= now() - interval '7 days';
    IF recent_count > 0 THEN
      RAISE EXCEPTION 'rate_limited: jadwal staff ini sudah diubah dalam 7 hari terakhir, coba lagi minggu depan';
    END IF;
    INSERT INTO public.raos_shift_schedule_edit_log (staff_id, changed_by) VALUES (OLD.staff_id, auth.uid());
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_raos_shift_schedule_guard ON public.raos_shift_schedules;
CREATE TRIGGER trg_raos_shift_schedule_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.raos_shift_schedules
  FOR EACH ROW EXECUTE FUNCTION public.raos_shift_schedule_guard();

REVOKE ALL ON FUNCTION public.raos_shift_schedule_guard() FROM PUBLIC;

-- shifts & branches sudah readable oleh authenticated lewat policy existing
-- masing-masing tabel — tidak perlu policy tambahan di sini.

-- RPC roster board: user_profiles RLS cuma izinkan staff biasa baca baris
-- sendiri (user_profiles_select_own), jadi staff TIDAK BISA join langsung ke
-- profil staff lain buat nampilin roster 1 cabang. RPC ini bypass itu dengan
-- SECURITY DEFINER, tapi tetap cek is_branch_in_scope dulu sebelum return apa
-- pun — jadi staff/koordinator cuma bisa lihat roster cabang yang in-scope,
-- sama seperti batasan raos_shift_schedules_select.
CREATE OR REPLACE FUNCTION public.raos_shift_schedule_board(p_branch_id uuid, p_tanggal date)
RETURNS TABLE (
  staff_id         uuid,
  full_name        text,
  schedule_id      uuid,
  shift_id         uuid,
  shift_name       text,
  last_changed_at  timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_branch_in_scope(p_branch_id) THEN
    RAISE EXCEPTION 'branch_out_of_scope';
  END IF;

  RETURN QUERY
  SELECT up.id, up.full_name, rs.id, rs.shift_id, s.name, rs.last_changed_at
  FROM public.user_profiles up
  LEFT JOIN public.raos_shift_schedules rs
    ON rs.staff_id = up.id AND rs.tanggal = p_tanggal
  LEFT JOIN public.shifts s ON s.id = rs.shift_id
  WHERE up.branch_id = p_branch_id AND up.role = 'staff' AND up.is_active = true
  ORDER BY up.full_name;
END;
$$;

COMMENT ON FUNCTION public.raos_shift_schedule_board(uuid, date) IS
  'Roster jadwal shift 1 cabang utk 1 tanggal — daftar staff aktif cabang + shift terjadwal (kalau ada). Dipakai Settings > Jadwal Kerja.';

REVOKE ALL ON FUNCTION public.raos_shift_schedule_board(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.raos_shift_schedule_board(uuid, date) TO authenticated;
