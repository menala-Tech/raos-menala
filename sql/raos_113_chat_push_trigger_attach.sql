-- ─────────────────────────────────────────────────────────────────────────
-- RAOS 113 — Attach chat push notification trigger
--
-- Discovery (2026-08-22): raos_110 defined the trigger FUNCTION
-- `raos_notify_new_chat_message()`, but the canonical source did not contain
-- the `CREATE TRIGGER ... ON chat_messages` statement. This migration
-- attaches the existing function to `chat_messages` AFTER INSERT so group
-- chat text (and other message types) dispatch a Web Push to eligible room
-- members through the existing `raos_dispatch_push` path.
--
-- Idempotent: DROP IF EXISTS before CREATE.
-- No recipient rules are changed; sender-exclusion, room-membership,
-- role/data-scope and notification_prefs filtering remain server-side.
-- Do NOT run this on production until cloud verification.
-- ─────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_raos_notify_new_chat_message ON public.chat_messages;

CREATE TRIGGER trg_raos_notify_new_chat_message
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.raos_notify_new_chat_message();
