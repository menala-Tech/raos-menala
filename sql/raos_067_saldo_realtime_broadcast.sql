-- raos_067_saldo_realtime_broadcast.sql
--
-- Broadcast realtime channel 'raos-saldo-new' saat pengajuan Isi Saldo baru
-- masuk. Modul Finance di Rifim-OS Portal subscribe channel ini untuk beep
-- + toast instan (no polling, no auth session di portal).
--
-- private=false → public topic, anon key portal bisa subscribe tanpa login
-- Supabase Auth. Payload sengaja minimal (staff_name, branch_name, nominal,
-- request_no) — tidak leak field sensitif.

CREATE OR REPLACE FUNCTION public.raos_broadcast_new_saldo_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, realtime
AS $$
DECLARE
  v_staff_name text;
  v_branch_name text;
BEGIN
  SELECT full_name INTO v_staff_name FROM public.user_profiles WHERE id = NEW.staff_id;
  SELECT name      INTO v_branch_name FROM public.branches       WHERE id = NEW.branch_id;

  PERFORM realtime.send(
    jsonb_build_object(
      'id',          NEW.id,
      'request_no',  NEW.request_no,
      'staff_name',  COALESCE(v_staff_name, '?'),
      'branch_name', COALESCE(v_branch_name, '?'),
      'branch_id',   NEW.branch_id,
      'nominal',     NEW.nominal,
      'requested_at', NEW.requested_at
    ),
    'new',
    'raos-saldo-new',
    false
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Jangan gagalkan INSERT kalau broadcast bermasalah (network hiccup dsb)
  RAISE WARNING 'raos_broadcast_new_saldo_request failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_raos_broadcast_new_saldo_request ON public.raos_saldo_requests;
CREATE TRIGGER trg_raos_broadcast_new_saldo_request
AFTER INSERT ON public.raos_saldo_requests
FOR EACH ROW
EXECUTE FUNCTION public.raos_broadcast_new_saldo_request();
