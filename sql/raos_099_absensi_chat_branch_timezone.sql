-- =====================================================================
-- Fix C — absensi chat notification timezone
-- =====================================================================
-- Root cause (confirmed via live pg_proc read, vlievtojpmrbsmzlqswl,
-- 2026-08-19): raos_broadcast_absensi_to_chat() (fired by
-- trg_raos_broadcast_absensi_to_chat on raos_attendance INSERT/UPDATE,
-- confirmed working via smoke test on an authenticated UPG staff row)
-- hardcodes `AT TIME ZONE 'Asia/Jakarta'` and the literal suffix ' WIB'
-- for both MASUK and PULANG times, regardless of which branch the
-- attendance row actually belongs to. branches.timezone for BPN/MDC/UPG
-- is 'Asia/Makassar' (WITA) -- those branches' chat notifications were
-- showing a time that is 1 hour behind the branch's actual local time,
-- still labeled "WIB".
--
-- This migration derives both the display time AND the zone label from
-- NEW.branch_id -> branches.timezone, per the mapping:
--   Asia/Jakarta                  -> WIB
--   Asia/Makassar / Asia/Kuching  -> WITA
--   Asia/Jayapura                 -> WIT
--   (anything else / null)        -> WIB (same fallback the rest of the
--                                    codebase uses for an unset timezone)
--
-- Explicitly unchanged: target room resolution (still "absensi" by
-- name), selfie link mechanism (still the raos-selfie://<path> token,
-- unpacked into a signed URL client-side by TimelineMessage -- Fix D),
-- message content structure/emoji, exception-swallowing behavior (still
-- RAISE WARNING + RETURN NEW so a broadcast failure never blocks the
-- attendance write itself).
-- =====================================================================

create or replace function public.raos_broadcast_absensi_to_chat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_room_id uuid;
  v_staff_name text;
  v_branch_name text;
  v_branch_timezone text;
  v_zone_label text;
  v_shift_name text;
  v_event_type text;
  v_time_str text;
  v_date_str text;
  v_lokasi text;
  v_content text;
  v_selfie_path text;
BEGIN
  SELECT id INTO v_room_id FROM chat_rooms WHERE lower(name) = 'absensi' AND is_active = true LIMIT 1;
  IF v_room_id IS NULL THEN RETURN NEW; END IF;

  SELECT name, COALESCE(timezone, 'Asia/Jakarta') INTO v_branch_name, v_branch_timezone
    FROM branches WHERE id = NEW.branch_id;
  v_branch_timezone := COALESCE(v_branch_timezone, 'Asia/Jakarta');

  v_zone_label := CASE v_branch_timezone
    WHEN 'Asia/Makassar' THEN 'WITA'
    WHEN 'Asia/Kuching'  THEN 'WITA'
    WHEN 'Asia/Jayapura' THEN 'WIT'
    ELSE 'WIB'
  END;

  IF TG_OP = 'INSERT' AND NEW.check_in_at IS NOT NULL THEN
    v_event_type := 'MASUK';
    v_time_str := to_char((NEW.check_in_at AT TIME ZONE v_branch_timezone), 'HH24:MI');
    v_selfie_path := NEW.selfie_in_url;
  ELSIF TG_OP = 'UPDATE' AND OLD.check_out_at IS NULL AND NEW.check_out_at IS NOT NULL THEN
    v_event_type := 'PULANG';
    v_time_str := to_char((NEW.check_out_at AT TIME ZONE v_branch_timezone), 'HH24:MI');
    v_selfie_path := NEW.selfie_out_url;
  ELSE
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_staff_name FROM user_profiles WHERE id = NEW.staff_id;
  SELECT name INTO v_shift_name FROM shifts WHERE id = NEW.shift_id;
  v_date_str := to_char(NEW.date, 'DD Month YYYY');
  v_lokasi := CASE WHEN NEW.is_location_valid
                   THEN 'Di dalam radius pickup point'
                   ELSE 'Di luar radius (perlu verifikasi)' END;

  v_content := CASE v_event_type
    WHEN 'MASUK' THEN E'✅ ABSEN MASUK\n\n'
    ELSE E'\U0001f3c1 ABSEN PULANG\n\n'
  END
  || 'Nama: ' || COALESCE(v_staff_name, 'Unknown') || E'\n'
  || 'Cabang: ' || COALESCE(v_branch_name, '-') || E'\n'
  || CASE WHEN v_shift_name IS NOT NULL THEN 'Shift: ' || v_shift_name || E'\n' ELSE '' END
  || 'Jam: ' || v_time_str || ' ' || v_zone_label || E'\n'
  || 'Tanggal: ' || trim(v_date_str) || E'\n'
  || 'Lokasi: ' || v_lokasi || E'\n'
  || CASE WHEN v_selfie_path IS NOT NULL AND length(v_selfie_path) > 0
          THEN E'\n\U0001f4f7 Foto Selfie: raos-selfie://' || v_selfie_path || E'\n'
          ELSE '' END
  || E'\n------------------------\n'
  || 'PT. Menala Internasional Gemilang';

  INSERT INTO chat_messages (room_id, sender_id, type, content)
  VALUES (v_room_id, NEW.staff_id, 'text', v_content);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'raos_broadcast_absensi_to_chat gagal: %', SQLERRM;
  RETURN NEW;
END; $$;

comment on function public.raos_broadcast_absensi_to_chat() is
  'Fix C (2026-08-19): MASUK/PULANG time and zone label now derived from NEW.branch_id -> branches.timezone (Asia/Jakarta->WIB, Asia/Makassar or Asia/Kuching->WITA, Asia/Jayapura->WIT) instead of a hardcoded Asia/Jakarta/WIB. Room resolution, selfie token format, and content structure unchanged.';
