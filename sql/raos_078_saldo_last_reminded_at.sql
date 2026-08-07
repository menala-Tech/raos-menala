-- raos_078 (2026-08-08): Poin 7 — track last reminder chat "Belum Diisi"
-- untuk avoid spam. Cron 5-menit GAS post reminder ke room Pengisian Saldo
-- cabang, update kolom ini supaya interval terjaga.

ALTER TABLE public.raos_saldo_requests
  ADD COLUMN IF NOT EXISTS last_reminded_at timestamptz;

CREATE INDEX IF NOT EXISTS raos_saldo_requests_reminder_idx
  ON public.raos_saldo_requests (requested_at, last_reminded_at)
  WHERE is_processed = false;

COMMENT ON COLUMN public.raos_saldo_requests.last_reminded_at IS
  'raos_078: timestamp reminder chat terakhir untuk request yang belum diproses. NULL = belum pernah di-reminder.';
