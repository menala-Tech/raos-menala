-- raos_083b_aist_rpc_grant_hardening
-- Supabase default privileges grant newly created functions explicitly to
-- anon/authenticated. REVOKE ... FROM PUBLIC alone is therefore insufficient.
-- Broker mutation/helper RPCs must be service-role only.

REVOKE EXECUTE ON FUNCTION public.aist_enqueue_saldo_request_trg() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.aist_agent_heartbeat(text,uuid,text,text,text,text,boolean,boolean,timestamptz,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.aist_claim_job(text,uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.aist_job_set_running(uuid,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.aist_job_set_verifying(uuid,text,text,jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.aist_job_finish(uuid,text,boolean,text,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.aist_mark_sla_timeouts() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.aist_refresh_invoice_daily(uuid,date) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.aist_request_manual(uuid,uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.aist_agent_get_operator(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.aist_job_get_for_device(uuid,text) FROM anon, authenticated;

-- Invoice validation is an authenticated UI RPC with its own auth.uid() +
-- Admin/Direksi/Direktur guard. It must never be anonymously callable.
REVOKE EXECUTE ON FUNCTION public.aist_validate_invoice_daily(uuid,text,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.aist_validate_invoice_daily(uuid,text,text) TO authenticated;

-- Reassert broker-only service role grants explicitly.
GRANT EXECUTE ON FUNCTION public.aist_agent_heartbeat(text,uuid,text,text,text,text,boolean,boolean,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.aist_claim_job(text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.aist_job_set_running(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.aist_job_set_verifying(uuid,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.aist_job_finish(uuid,text,boolean,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.aist_mark_sla_timeouts() TO service_role;
GRANT EXECUTE ON FUNCTION public.aist_refresh_invoice_daily(uuid,date) TO service_role;
GRANT EXECUTE ON FUNCTION public.aist_request_manual(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.aist_agent_get_operator(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.aist_job_get_for_device(uuid,text) TO service_role;
