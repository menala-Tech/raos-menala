-- ─────────────────────────────────────────────────────────────────────────
-- RAOS 058 — Fix batch 30 Juli 2026:
--   #1 scope member room per-cabang (Driver/Saldo) + cleanup member salah
--   #2 broadcast Absensi inject token "raos-selfie://<path>" untuk foto
--   #4 RLS user_profiles: authenticated boleh baca profil aktif (bubble
--      chat tidak "Unknown" lagi)
--   #6 view raos_geofence_points: fallback branches.lat/lng+default_radius
--      untuk cabang tanpa pickup_points
-- ─────────────────────────────────────────────────────────────────────────

-- #4 ------------------------------------------------------------------
DROP POLICY IF EXISTS user_profiles_select_chat_participants ON public.user_profiles;
CREATE POLICY user_profiles_select_chat_participants
  ON public.user_profiles FOR SELECT
  TO authenticated
  USING (is_active = true);

-- #1 ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.raos_cleanup_branch_room_members()
RETURNS TABLE(room_id uuid, removed_count int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_room record; v_count int;
BEGIN
  FOR v_room IN
    SELECT cr.id, cr.branch_id, cr.name FROM chat_rooms cr
     WHERE cr.branch_id IS NOT NULL AND cr.is_active = true
  LOOP
    WITH deleted AS (
      DELETE FROM chat_room_members m USING user_profiles up
       WHERE m.room_id = v_room.id AND m.user_id = up.id
         AND up.role NOT IN ('admin','management','direksi')
         AND (up.branch_id IS DISTINCT FROM v_room.branch_id)
      RETURNING m.user_id
    ) SELECT count(*) INTO v_count FROM deleted;
    room_id := v_room.id; removed_count := v_count; RETURN NEXT;
  END LOOP;
END; $$;

REVOKE EXECUTE ON FUNCTION public.raos_cleanup_branch_room_members() FROM public;
GRANT  EXECUTE ON FUNCTION public.raos_cleanup_branch_room_members() TO service_role;

CREATE OR REPLACE FUNCTION public.seed_room_per_branch(p_room_name text)
RETURNS TABLE(branch_slug text, room_id uuid, created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_caller_role text; v_branch record; v_existing uuid; v_new uuid; v_full_name text;
BEGIN
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT role INTO v_caller_role FROM user_profiles WHERE id = v_caller_id;
  IF v_caller_role NOT IN ('admin','management','direksi') THEN
    RAISE EXCEPTION 'role_not_allowed: %', v_caller_role;
  END IF;

  FOR v_branch IN
    SELECT id, slug, name FROM branches
     WHERE is_active AND slug IS NOT NULL
       AND branch_type IN ('airport','airport_hub','operational')
     ORDER BY slug
  LOOP
    v_full_name := format('%s — %s', p_room_name, v_branch.name);
    SELECT id INTO v_existing FROM chat_rooms
     WHERE branch_id = v_branch.id
       AND (lower(name) = lower(v_full_name) OR lower(name) = lower(p_room_name))
     LIMIT 1;

    IF v_existing IS NULL THEN
      INSERT INTO chat_rooms (name, description, category, branch_id, is_active, created_by)
      VALUES (v_full_name, format('Room %s cabang %s', p_room_name, v_branch.name),
              'proyek', v_branch.id, true, v_caller_id)
      RETURNING id INTO v_new;
    ELSE v_new := v_existing;
    END IF;

    INSERT INTO chat_room_members (room_id, user_id)
    SELECT v_new, id FROM user_profiles
     WHERE is_active AND (branch_id = v_branch.id OR role IN ('admin','management','direksi'))
    ON CONFLICT DO NOTHING;

    DELETE FROM chat_room_members m USING user_profiles up
     WHERE m.room_id = v_new AND m.user_id = up.id
       AND up.role NOT IN ('admin','management','direksi')
       AND (up.branch_id IS DISTINCT FROM v_branch.id);

    branch_slug := v_branch.slug; room_id := v_new; created := (v_existing IS NULL);
    RETURN NEXT;
  END LOOP;
END; $$;

-- #2 ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.raos_broadcast_absensi_to_chat()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_room_id uuid; v_staff_name text; v_branch_name text; v_shift_name text;
  v_event_type text; v_time_str text; v_date_str text; v_lokasi text;
  v_content text; v_selfie_path text;
BEGIN
  SELECT id INTO v_room_id FROM chat_rooms WHERE lower(name) = 'absensi' AND is_active LIMIT 1;
  IF v_room_id IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' AND NEW.check_in_at IS NOT NULL THEN
    v_event_type := 'MASUK';
    v_time_str := to_char((NEW.check_in_at AT TIME ZONE 'Asia/Jakarta'), 'HH24:MI');
    v_selfie_path := NEW.selfie_in_url;
  ELSIF TG_OP = 'UPDATE' AND OLD.check_out_at IS NULL AND NEW.check_out_at IS NOT NULL THEN
    v_event_type := 'PULANG';
    v_time_str := to_char((NEW.check_out_at AT TIME ZONE 'Asia/Jakarta'), 'HH24:MI');
    v_selfie_path := NEW.selfie_out_url;
  ELSE RETURN NEW;
  END IF;

  SELECT full_name INTO v_staff_name FROM user_profiles WHERE id = NEW.staff_id;
  SELECT name INTO v_branch_name FROM branches WHERE id = NEW.branch_id;
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
  || 'Jam: ' || v_time_str || ' WIB' || E'\n'
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

-- #6 ------------------------------------------------------------------
CREATE OR REPLACE VIEW public.raos_geofence_points AS
  SELECT pp.id, pp.name, pp.latitude, pp.longitude, pp.radius_meters, pp.branch_id, pp.is_active
    FROM public.pickup_points pp
   WHERE pp.is_active = true
  UNION ALL
  SELECT b.id AS id,
         'Kantor ' || b.name AS name,
         b.latitude, b.longitude,
         COALESCE(b.default_radius_meters, 500) AS radius_meters,
         b.id AS branch_id,
         true AS is_active
    FROM public.branches b
   WHERE b.is_active
     AND b.latitude IS NOT NULL AND b.longitude IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.pickup_points pp
        WHERE pp.branch_id = b.id AND pp.is_active
     );

GRANT SELECT ON public.raos_geofence_points TO authenticated;
