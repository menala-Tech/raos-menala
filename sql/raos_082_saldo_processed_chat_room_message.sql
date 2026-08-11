-- raos_082_saldo_processed_chat_room_message
-- Production migration: post status final ke room Pengisian Saldo request.
--
-- Ketika saldo berubah is_processed false -> true:
-- 1. push notification ke staff (existing)
-- 2. post message "Saldo Sudah Diisi" ke chat_room_id milik request
-- 3. progress KPI ke chat pribadi staff (existing)
--
-- Post hanya ke room Pengisian Saldo yang sudah tersimpan di NEW.chat_room_id.
-- Tidak post ke Driver room umum. Trigger tetap idempotent karena hanya fire
-- pada transition false -> true.

CREATE OR REPLACE FUNCTION public.raos_saldo_after_processed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_staff_name text;
  v_branch_name text;
  v_sender_id uuid;
  v_pribadi_room_id uuid;
  v_snapshot record;
  v_pin_emoji text;
  v_pin_label text;
  v_hint text;
  v_target_display text;
  v_realisasi_display text;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF NOT (OLD.is_processed = false AND NEW.is_processed = true) THEN RETURN NEW; END IF;

  SELECT full_name INTO v_staff_name
  FROM user_profiles
  WHERE id = NEW.staff_id;

  SELECT name INTO v_branch_name
  FROM branches
  WHERE id = NEW.branch_id;

  v_sender_id := COALESCE(NEW.processed_by, public.raos_get_system_bot_id());

  PERFORM raos_dispatch_push(
    ARRAY[NEW.staff_id],
    'Saldo Anda Sudah Diisi',
    format(
      'Isi saldo Rp%s (%s) sudah diproses admin. Silakan cek di aplikasi.',
      to_char(NEW.nominal, 'FM999,999,999'),
      NEW.request_no
    ),
    '/riwayat',
    'saldo-processed-' || NEW.id,
    'pengumuman'
  );

  -- Status final ke room Pengisian Saldo request, bukan Driver room umum.
  IF NEW.chat_room_id IS NOT NULL AND v_sender_id IS NOT NULL THEN
    INSERT INTO chat_messages (room_id, sender_id, type, content)
    VALUES (
      NEW.chat_room_id,
      v_sender_id,
      'text',
      format(
        E'✅ SALDO SUDAH DIISI\n\n%s • Rp%s\nDriver: %s\nCabang: %s\nDiproses: %s\n\n— Sistem RAOS',
        NEW.request_no,
        to_char(NEW.nominal, 'FM999,999,999'),
        COALESCE(NEW.driver_name, '-'),
        COALESCE(v_branch_name, '-'),
        to_char(COALESCE(NEW.processed_at, now()) AT TIME ZONE 'Asia/Makassar', 'DD Mon YYYY HH24:MI')
      )
    );
  END IF;

  -- Existing KPI progress ke chat pribadi staff.
  IF v_sender_id IS NOT NULL AND v_sender_id <> NEW.staff_id THEN
    SELECT s.mode, s.target_val, s.realisasi_val, s.pct
      INTO v_snapshot
      FROM public.raos_saldo_progress_snapshot(NEW.staff_id) s
      LIMIT 1;

    IF v_snapshot.target_val IS NOT NULL AND v_snapshot.target_val > 0 THEN
      IF v_snapshot.pct >= 100 THEN
        v_pin_emoji := '🟢';
        v_pin_label := 'TARGET TERCAPAI';
        v_hint := 'Selamat! Target bulan ini sudah tercapai. Pertahankan.';
      ELSIF v_snapshot.pct >= 50 THEN
        v_pin_emoji := '🟡';
        v_pin_label := 'MENUJU TARGET';
        v_hint := 'Semangat! Kejar sisa target sebelum akhir bulan.';
      ELSE
        v_pin_emoji := '🔴';
        v_pin_label := 'WASPADA';
        v_hint := 'Realisasi masih jauh dari target. Ayo fokus & tambah upaya.';
      END IF;

      IF v_snapshot.mode = 'order' THEN
        v_target_display := format('%s scan valid', to_char(v_snapshot.target_val, 'FM999,999,999'));
        v_realisasi_display := format('%s scan valid', to_char(v_snapshot.realisasi_val, 'FM999,999,999'));
      ELSE
        v_target_display := 'Rp' || to_char(v_snapshot.target_val, 'FM999,999,999');
        v_realisasi_display := 'Rp' || to_char(v_snapshot.realisasi_val, 'FM999,999,999');
      END IF;

      v_pribadi_room_id := public.raos_ensure_pribadi_room(NEW.staff_id, v_sender_id);

      IF v_pribadi_room_id IS NOT NULL THEN
        INSERT INTO chat_messages (room_id, sender_id, type, content)
        VALUES (
          v_pribadi_room_id,
          v_sender_id,
          'text',
          format(
            E'%s *%s*\n\n📊 Pencapaian Target Bulan Ini (%s)\n\nTarget: %s\nRealisasi: %s\nPersentase: %s%%\n\n%s\n\n— Sistem Bot RAOS',
            v_pin_emoji,
            v_pin_label,
            CASE WHEN v_snapshot.mode = 'order' THEN 'Order — Scan Valid' ELSE 'Saldo — Nominal' END,
            v_target_display,
            v_realisasi_display,
            to_char(v_snapshot.pct, 'FM999,999,990.0'),
            v_hint
          )
        );

        PERFORM raos_dispatch_push(
          ARRAY[NEW.staff_id],
          v_pin_emoji || ' Pencapaian ' || to_char(v_snapshot.pct, 'FM999,999,990.0') || '%',
          format('%s dari target %s. Cek chat pribadi.', v_realisasi_display, v_target_display),
          '/chat',
          'saldo-progress-' || NEW.id,
          'pengumuman'
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
