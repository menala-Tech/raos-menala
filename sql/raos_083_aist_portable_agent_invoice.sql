-- raos_083_aist_portable_agent_invoice
-- Portable multi-device AIST agent, atomic claim/lease, manual priority,
-- auto fallback after 60s, 120s SLA, and daily invoice audit.
-- SSOT remains public.raos_saldo_requests.

CREATE TABLE IF NOT EXISTS public.aist_agents (
  device_id text PRIMARY KEY,
  operator_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  operator_email text,
  machine_name text,
  agent_version text,
  status text NOT NULL DEFAULT 'offline' CHECK (status IN ('offline','online','busy','error')),
  aist_ready boolean NOT NULL DEFAULT false,
  finance_ready boolean NOT NULL DEFAULT false,
  last_admin_activity_at timestamptz,
  last_seen_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aist_agents_seen_idx ON public.aist_agents(last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.aist_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.raos_saldo_requests(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  staff_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES public.raos_drivers(id) ON DELETE SET NULL,
  driver_login_id text NOT NULL,
  driver_name text,
  nominal numeric(18,2) NOT NULL,
  requested_at timestamptz NOT NULL,
  auto_after timestamptz NOT NULL,
  sla_deadline timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','claimed','running','verifying','success','failed','timeout','cancelled')),
  mode text CHECK (mode IN ('manual','auto')),
  manual_requested_at timestamptz,
  manual_requested_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  claimed_by_device text REFERENCES public.aist_agents(device_id) ON DELETE SET NULL,
  claimed_by_operator uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  claim_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  aist_reference text,
  aist_result jsonb,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aist_jobs_queue_idx ON public.aist_jobs(status,auto_after,requested_at);
CREATE INDEX IF NOT EXISTS aist_jobs_branch_date_idx ON public.aist_jobs(branch_id,requested_at DESC);
CREATE INDEX IF NOT EXISTS aist_jobs_driver_idx ON public.aist_jobs(driver_id,requested_at DESC);

CREATE TABLE IF NOT EXISTS public.aist_invoice_daily_validation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  invoice_date date NOT NULL,
  total_transactions integer NOT NULL DEFAULT 0,
  total_nominal numeric(18,2) NOT NULL DEFAULT 0,
  aist_valid_count integer NOT NULL DEFAULT 0,
  mismatch_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','validated','correction_requested')),
  validated_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  validated_at timestamptz,
  correction_note text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(branch_id,invoice_date)
);

CREATE OR REPLACE FUNCTION public.aist_enqueue_saldo_request_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.driver_login_id IS NULL OR trim(NEW.driver_login_id)='' THEN RETURN NEW; END IF;
  INSERT INTO public.aist_jobs(request_id,branch_id,staff_id,driver_id,driver_login_id,driver_name,nominal,requested_at,auto_after,sla_deadline)
  VALUES(NEW.id,NEW.branch_id,NEW.staff_id,NEW.driver_id,NEW.driver_login_id,NEW.driver_name,NEW.nominal,NEW.requested_at,NEW.requested_at+interval '60 seconds',NEW.requested_at+interval '120 seconds')
  ON CONFLICT(request_id) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_aist_enqueue_saldo_request ON public.raos_saldo_requests;
CREATE TRIGGER trg_aist_enqueue_saldo_request AFTER INSERT ON public.raos_saldo_requests
FOR EACH ROW EXECUTE FUNCTION public.aist_enqueue_saldo_request_trg();

-- Backfill existing active requests. Expired rows are timeout and never auto-run;
-- Admin/Direksi/Direktur may explicitly recover them through manual request.
INSERT INTO public.aist_jobs(request_id,branch_id,staff_id,driver_id,driver_login_id,driver_name,nominal,requested_at,auto_after,sla_deadline,status)
SELECT r.id,r.branch_id,r.staff_id,r.driver_id,r.driver_login_id,r.driver_name,r.nominal,r.requested_at,
       r.requested_at+interval '60 seconds',r.requested_at+interval '120 seconds',
       CASE WHEN r.requested_at+interval '120 seconds'<=now() THEN 'timeout' ELSE 'queued' END
FROM public.raos_saldo_requests r
WHERE r.is_processed=false AND r.status IN ('pending','approved')
  AND r.driver_login_id IS NOT NULL AND trim(r.driver_login_id)<>''
ON CONFLICT(request_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.aist_agent_heartbeat(
  p_device_id text,p_operator_id uuid,p_operator_email text,p_machine_name text,p_agent_version text,
  p_status text,p_aist_ready boolean,p_finance_ready boolean,p_last_admin_activity_at timestamptz DEFAULT NULL,p_last_error text DEFAULT NULL
) RETURNS public.aist_agents LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.aist_agents;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.user_profiles up WHERE up.id=p_operator_id AND up.is_active=true AND lower(up.role) IN ('admin','direksi','direktur')) THEN
    RAISE EXCEPTION 'operator_role_not_allowed';
  END IF;
  IF p_device_id IS NULL OR trim(p_device_id)='' THEN RAISE EXCEPTION 'device_id_required'; END IF;
  INSERT INTO public.aist_agents(device_id,operator_id,operator_email,machine_name,agent_version,status,aist_ready,finance_ready,last_admin_activity_at,last_seen_at,last_error,updated_at)
  VALUES(trim(p_device_id),p_operator_id,p_operator_email,p_machine_name,p_agent_version,COALESCE(NULLIF(p_status,''),'online'),COALESCE(p_aist_ready,false),COALESCE(p_finance_ready,false),p_last_admin_activity_at,now(),p_last_error,now())
  ON CONFLICT(device_id) DO UPDATE SET operator_id=EXCLUDED.operator_id,operator_email=EXCLUDED.operator_email,machine_name=EXCLUDED.machine_name,
    agent_version=EXCLUDED.agent_version,status=EXCLUDED.status,aist_ready=EXCLUDED.aist_ready,finance_ready=EXCLUDED.finance_ready,
    last_admin_activity_at=EXCLUDED.last_admin_activity_at,last_seen_at=now(),last_error=EXCLUDED.last_error,updated_at=now()
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.aist_claim_job(p_device_id text,p_operator_id uuid)
RETURNS public.aist_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_agent public.aist_agents; v_job public.aist_jobs; v_mode text;
BEGIN
  SELECT * INTO v_agent FROM public.aist_agents
  WHERE device_id=p_device_id AND last_seen_at>=now()-interval '30 seconds' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent_offline'; END IF;
  IF v_agent.operator_id IS DISTINCT FROM p_operator_id OR NOT EXISTS(
    SELECT 1 FROM public.user_profiles up WHERE up.id=p_operator_id AND up.is_active=true AND lower(up.role) IN ('admin','direksi','direktur')
  ) THEN RAISE EXCEPTION 'agent_operator_not_allowed'; END IF;
  IF NOT v_agent.aist_ready OR NOT v_agent.finance_ready THEN RAISE EXCEPTION 'agent_not_ready'; END IF;

  UPDATE public.aist_jobs j SET status='timeout',error_code='sla_120s',error_message='Belum selesai dalam SLA 120 detik',updated_at=now()
  FROM public.raos_saldo_requests r
  WHERE r.id=j.request_id AND r.is_processed=false AND j.manual_requested_at IS NULL
    AND j.status IN ('queued','claimed','running') AND j.sla_deadline<now()
    AND (j.claim_expires_at IS NULL OR j.claim_expires_at<now());

  SELECT j.* INTO v_job FROM public.aist_jobs j JOIN public.raos_saldo_requests r ON r.id=j.request_id
  WHERE j.manual_requested_at IS NOT NULL AND j.status IN ('queued','failed','timeout') AND r.is_processed=false
    AND (j.claim_expires_at IS NULL OR j.claim_expires_at<now())
  ORDER BY j.manual_requested_at,j.requested_at FOR UPDATE OF j SKIP LOCKED LIMIT 1;

  IF FOUND THEN v_mode:='manual';
  ELSE
    IF v_agent.last_admin_activity_at IS NOT NULL AND v_agent.last_admin_activity_at>now()-interval '60 seconds' THEN RETURN NULL; END IF;
    v_mode:='auto';
    SELECT j.* INTO v_job FROM public.aist_jobs j JOIN public.raos_saldo_requests r ON r.id=j.request_id
    WHERE j.status IN ('queued','failed') AND j.manual_requested_at IS NULL AND r.is_processed=false
      AND j.auto_after<=now() AND j.sla_deadline>now()
      AND (j.claim_expires_at IS NULL OR j.claim_expires_at<now())
    ORDER BY j.requested_at FOR UPDATE OF j SKIP LOCKED LIMIT 1;
  END IF;
  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE public.aist_jobs SET status='claimed',mode=v_mode,claimed_by_device=p_device_id,claimed_by_operator=p_operator_id,
    claim_expires_at=now()+interval '90 seconds',attempt_count=attempt_count+1,error_code=NULL,error_message=NULL,updated_at=now()
  WHERE id=v_job.id RETURNING * INTO v_job;
  UPDATE public.aist_agents SET status='busy',updated_at=now() WHERE device_id=p_device_id;
  RETURN v_job;
END $$;

CREATE OR REPLACE FUNCTION public.aist_job_set_running(p_job_id uuid,p_device_id text)
RETURNS public.aist_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_job public.aist_jobs;
BEGIN
  UPDATE public.aist_jobs SET status='running',started_at=COALESCE(started_at,now()),claim_expires_at=now()+interval '90 seconds',updated_at=now()
  WHERE id=p_job_id AND claimed_by_device=p_device_id AND status='claimed' RETURNING * INTO v_job;
  RETURN v_job;
END $$;

CREATE OR REPLACE FUNCTION public.aist_job_set_verifying(p_job_id uuid,p_device_id text,p_reference text,p_result jsonb DEFAULT '{}'::jsonb)
RETURNS public.aist_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_job public.aist_jobs;
BEGIN
  UPDATE public.aist_jobs SET status='verifying',aist_reference=NULLIF(trim(p_reference),''),aist_result=COALESCE(p_result,'{}'::jsonb),
    claim_expires_at=now()+interval '60 seconds',updated_at=now()
  WHERE id=p_job_id AND claimed_by_device=p_device_id AND status='running' RETURNING * INTO v_job;
  RETURN v_job;
END $$;

CREATE OR REPLACE FUNCTION public.aist_job_finish(p_job_id uuid,p_device_id text,p_success boolean,p_error_code text DEFAULT NULL,p_error_message text DEFAULT NULL)
RETURNS public.aist_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_job public.aist_jobs;
BEGIN
  UPDATE public.aist_jobs SET status=CASE WHEN p_success THEN 'success' ELSE 'failed' END,completed_at=now(),claim_expires_at=NULL,
    error_code=CASE WHEN p_success THEN NULL ELSE p_error_code END,error_message=CASE WHEN p_success THEN NULL ELSE p_error_message END,updated_at=now()
  WHERE id=p_job_id AND claimed_by_device=p_device_id AND status IN ('running','verifying','claimed') RETURNING * INTO v_job;
  UPDATE public.aist_agents SET status=CASE WHEN p_success THEN 'online' ELSE 'error' END,
    last_error=CASE WHEN p_success THEN NULL ELSE p_error_message END,updated_at=now() WHERE device_id=p_device_id;
  RETURN v_job;
END $$;

CREATE OR REPLACE FUNCTION public.aist_mark_sla_timeouts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.aist_jobs j SET status='timeout',error_code='sla_120s',error_message='Belum selesai dalam SLA 120 detik',updated_at=now()
  FROM public.raos_saldo_requests r
  WHERE r.id=j.request_id AND r.is_processed=false AND j.manual_requested_at IS NULL
    AND j.status IN ('queued','claimed','running') AND j.sla_deadline<now()
    AND (j.claim_expires_at IS NULL OR j.claim_expires_at<now());
  GET DIAGNOSTICS v_count=ROW_COUNT; RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION public.aist_request_manual(p_request_id uuid,p_operator_id uuid)
RETURNS public.aist_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_job public.aist_jobs;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.user_profiles up WHERE up.id=p_operator_id AND up.is_active=true AND lower(up.role) IN ('admin','direksi','direktur')) THEN
    RAISE EXCEPTION 'operator_role_not_allowed';
  END IF;
  UPDATE public.aist_jobs j SET manual_requested_at=now(),manual_requested_by=p_operator_id,
    status=CASE WHEN j.status IN ('failed','timeout') THEN 'queued' ELSE j.status END,error_code=NULL,error_message=NULL,updated_at=now()
  FROM public.raos_saldo_requests r
  WHERE j.request_id=p_request_id AND r.id=j.request_id AND r.is_processed=false
    AND j.status NOT IN ('success','cancelled','running','verifying','claimed') RETURNING j.* INTO v_job;
  RETURN v_job;
END $$;

CREATE OR REPLACE FUNCTION public.aist_refresh_invoice_daily(p_branch_id uuid,p_date date)
RETURNS public.aist_invoice_daily_validation LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.aist_invoice_daily_validation;
BEGIN
  INSERT INTO public.aist_invoice_daily_validation(branch_id,invoice_date,total_transactions,total_nominal,aist_valid_count,mismatch_count,generated_at,updated_at)
  SELECT p_branch_id,p_date,count(*)::integer,COALESCE(sum(r.nominal),0)::numeric(18,2),
    count(*) FILTER(WHERE j.status='success')::integer,
    count(*) FILTER(WHERE j.id IS NULL OR j.status<>'success' OR j.driver_login_id IS DISTINCT FROM r.driver_login_id
      OR j.nominal IS DISTINCT FROM r.nominal OR j.branch_id IS DISTINCT FROM r.branch_id)::integer,now(),now()
  FROM public.raos_saldo_requests r
  JOIN public.branches b ON b.id=r.branch_id
  LEFT JOIN public.aist_jobs j ON j.request_id=r.id
  WHERE r.branch_id=p_branch_id
    AND (r.requested_at AT TIME ZONE COALESCE(NULLIF(b.timezone,''),'Asia/Jakarta'))::date=p_date
    AND r.is_processed=true
  ON CONFLICT(branch_id,invoice_date) DO UPDATE SET total_transactions=EXCLUDED.total_transactions,total_nominal=EXCLUDED.total_nominal,
    aist_valid_count=EXCLUDED.aist_valid_count,mismatch_count=EXCLUDED.mismatch_count,generated_at=now(),updated_at=now()
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.aist_validate_invoice_daily(p_validation_id uuid,p_action text,p_note text DEFAULT NULL)
RETURNS public.aist_invoice_daily_validation LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_profile public.user_profiles; v_row public.aist_invoice_daily_validation;
BEGIN
  SELECT * INTO v_profile FROM public.user_profiles WHERE id=auth.uid() AND is_active=true;
  IF NOT FOUND OR lower(v_profile.role) NOT IN ('admin','direksi','direktur') THEN RAISE EXCEPTION 'invoice_write_role_required'; END IF;
  SELECT * INTO v_row FROM public.aist_invoice_daily_validation WHERE id=p_validation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'validation_not_found'; END IF;
  IF p_action='validate' THEN
    IF v_row.mismatch_count>0 THEN RAISE EXCEPTION 'cannot_validate_with_mismatch'; END IF;
    UPDATE public.aist_invoice_daily_validation SET status='validated',validated_by=auth.uid(),validated_at=now(),correction_note=NULL,updated_at=now()
    WHERE id=p_validation_id RETURNING * INTO v_row;
  ELSIF p_action='correction' THEN
    UPDATE public.aist_invoice_daily_validation SET status='correction_requested',validated_by=auth.uid(),validated_at=now(),
      correction_note=NULLIF(trim(p_note),''),updated_at=now() WHERE id=p_validation_id RETURNING * INTO v_row;
  ELSE RAISE EXCEPTION 'invalid_action'; END IF;
  RETURN v_row;
END $$;

-- Broker helpers, service-role only.
CREATE OR REPLACE FUNCTION public.aist_agent_get_operator(p_device_id text)
RETURNS public.aist_agents LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM public.aist_agents WHERE device_id=p_device_id AND last_seen_at>=now()-interval '30 seconds' LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.aist_job_get_for_device(p_job_id uuid,p_device_id text)
RETURNS public.aist_jobs LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM public.aist_jobs WHERE id=p_job_id AND claimed_by_device=p_device_id LIMIT 1
$$;

ALTER TABLE public.aist_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aist_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aist_invoice_daily_validation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aist_agents_admin_read ON public.aist_agents;
CREATE POLICY aist_agents_admin_read ON public.aist_agents FOR SELECT TO authenticated USING(
  EXISTS(SELECT 1 FROM public.user_profiles up WHERE up.id=auth.uid() AND up.is_active=true AND lower(up.role) IN ('admin','management','direksi','direktur'))
);
DROP POLICY IF EXISTS aist_jobs_scoped_read ON public.aist_jobs;
CREATE POLICY aist_jobs_scoped_read ON public.aist_jobs FOR SELECT TO authenticated USING(
  EXISTS(SELECT 1 FROM public.user_profiles up WHERE up.id=auth.uid() AND up.is_active=true AND (
    lower(up.role) IN ('admin','management','direksi','direktur')
    OR (lower(up.role)='koordinator' AND up.branch_id=aist_jobs.branch_id)
    OR (lower(up.role)='driver' AND up.driver_id=aist_jobs.driver_id)
    OR (lower(up.role)='staff' AND up.id=aist_jobs.staff_id)
  ))
);
DROP POLICY IF EXISTS aist_invoice_coordinator_read ON public.aist_invoice_daily_validation;
CREATE POLICY aist_invoice_coordinator_read ON public.aist_invoice_daily_validation FOR SELECT TO authenticated USING(
  EXISTS(SELECT 1 FROM public.user_profiles up WHERE up.id=auth.uid() AND up.is_active=true AND (
    lower(up.role) IN ('admin','management','direksi','direktur')
    OR (lower(up.role)='koordinator' AND up.branch_id=aist_invoice_daily_validation.branch_id)
  ))
);

GRANT SELECT ON public.aist_agents,public.aist_jobs,public.aist_invoice_daily_validation TO authenticated;
REVOKE ALL ON FUNCTION public.aist_validate_invoice_daily(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aist_validate_invoice_daily(uuid,text,text) TO authenticated;

REVOKE ALL ON FUNCTION public.aist_agent_heartbeat(text,uuid,text,text,text,text,boolean,boolean,timestamptz,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aist_claim_job(text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aist_job_set_running(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aist_job_set_verifying(uuid,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aist_job_finish(uuid,text,boolean,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aist_mark_sla_timeouts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aist_refresh_invoice_daily(uuid,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aist_request_manual(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aist_agent_get_operator(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aist_job_get_for_device(uuid,text) FROM PUBLIC;

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
