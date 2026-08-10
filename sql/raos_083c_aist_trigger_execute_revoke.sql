-- raos_083c_aist_trigger_execute_revoke
-- Trigger helper is invoked internally by PostgreSQL. It never needs API-role
-- EXECUTE privileges and should not remain executable through PUBLIC.
REVOKE ALL ON FUNCTION public.aist_enqueue_saldo_request_trg() FROM PUBLIC, anon, authenticated;
