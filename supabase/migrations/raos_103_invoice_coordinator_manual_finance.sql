-- RAOS 103 — Invoice Koordinator + manual Finance AIST audit
-- 2026-08-19
--
-- Goals:
-- 1) manual AIST operation remains canonical-safe while MENALA AIST worker is being rebuilt;
-- 2) Finance mark-paid records an explicit manual AIST success audit row (never pretends to be worker verification);
-- 3) daily invoice validation rows refresh automatically from paid saldo + AIST job lifecycle;
-- 4) Koordinator may validate/request correction only inside canonical branch scope;
-- 5) historical processed rows are backfilled into invoice validation WITHOUT rewriting their AIST job status.

create or replace function public.raos_saldo_mark_paid(p_request_id uuid, p_processor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v public.raos_saldo_requests%rowtype;
  r text;
  caller uuid := auth.uid();
  jwtrole text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  if p_request_id is null or p_processor_id is null then
    raise exception 'invalid_input';
  end if;

  if jwtrole <> 'service_role' and caller is distinct from p_processor_id then
    raise exception 'processor_mismatch';
  end if;

  select role into r
  from public.user_profiles
  where id = p_processor_id and is_active = true;

  if lower(coalesce(r, '')) not in ('admin', 'direksi', 'direktur') then
    raise exception 'role_not_allowed';
  end if;

  select * into v
  from public.raos_saldo_requests
  where id = p_request_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v.is_processed then
    return jsonb_build_object('status', 'already_processed', 'row', to_jsonb(v));
  end if;

  if v.status not in ('pending', 'approved') then
    return jsonb_build_object(
      'status', 'not_processable',
      'current_status', v.status,
      'row', to_jsonb(v)
    );
  end if;

  -- Never let a manual Finance confirmation overwrite a job currently owned
  -- by the desktop agent. This keeps one production owner per request and
  -- prevents manual/worker double-processing when the worker is enabled again.
  if exists (
    select 1
    from public.aist_jobs j
    where j.request_id = v.id
      and j.status in ('claimed', 'running', 'verifying')
  ) then
    raise exception 'aist_job_in_progress';
  end if;

  update public.raos_saldo_requests
  set is_processed = true,
      processed_at = now(),
      processed_by = p_processor_id,
      updated_at = now()
  where id = p_request_id
  returning * into v;

  -- Manual operation mode while the desktop worker is being rebuilt:
  -- Finance's explicit LUNAS action is the human confirmation that AIST was
  -- completed manually. Preserve that distinction in aist_result/reference.
  -- If the request has no driver login ID, do NOT fabricate an AIST success;
  -- the daily invoice will remain mismatch until identity is corrected.
  if nullif(trim(coalesce(v.driver_login_id, '')), '') is not null then
    insert into public.aist_jobs (
      request_id,
      branch_id,
      staff_id,
      driver_id,
      driver_login_id,
      driver_name,
      nominal,
      requested_at,
      auto_after,
      sla_deadline,
      status,
      mode,
      manual_requested_at,
      manual_requested_by,
      claimed_by_operator,
      started_at,
      completed_at,
      attempt_count,
      aist_reference,
      aist_result,
      error_code,
      error_message,
      updated_at
    ) values (
      v.id,
      v.branch_id,
      v.staff_id,
      v.driver_id,
      v.driver_login_id,
      v.driver_name,
      v.nominal,
      v.requested_at,
      v.requested_at + interval '60 seconds',
      v.requested_at + interval '120 seconds',
      'success',
      'manual',
      now(),
      p_processor_id,
      p_processor_id,
      now(),
      now(),
      1,
      'MANUAL_FINANCE_CONFIRM',
      jsonb_build_object(
        'verification_mode', 'manual_admin_confirmation',
        'processor_id', p_processor_id,
        'confirmed_at', now()
      ),
      null,
      null,
      now()
    )
    on conflict (request_id) do update
    set branch_id = excluded.branch_id,
        staff_id = excluded.staff_id,
        driver_id = excluded.driver_id,
        driver_login_id = excluded.driver_login_id,
        driver_name = excluded.driver_name,
        nominal = excluded.nominal,
        requested_at = excluded.requested_at,
        status = 'success',
        mode = 'manual',
        manual_requested_at = coalesce(public.aist_jobs.manual_requested_at, now()),
        manual_requested_by = p_processor_id,
        claimed_by_operator = p_processor_id,
        started_at = coalesce(public.aist_jobs.started_at, now()),
        completed_at = now(),
        attempt_count = greatest(public.aist_jobs.attempt_count, 1),
        aist_reference = 'MANUAL_FINANCE_CONFIRM',
        aist_result = jsonb_build_object(
          'verification_mode', 'manual_admin_confirmation',
          'processor_id', p_processor_id,
          'confirmed_at', now()
        ),
        error_code = null,
        error_message = null,
        updated_at = now();
  end if;

  -- Exactly-once room confirmation belongs to the lifecycle RPC, never to a client.
  if v.chat_room_id is not null and not exists (
    select 1
    from public.chat_messages m
    where m.room_id = v.chat_room_id
      and m.content like '%<!--RAOS_SALDO_PAID:' || v.id::text || '-->%'
  ) then
    insert into public.chat_messages(room_id, sender_id, type, content, client_id)
    values (
      v.chat_room_id,
      p_processor_id,
      'text',
      format(
        '✅ Saldo sudah diisi oleh admin.%s%s • Rp%s%s<!--RAOS_SALDO_PAID:%s-->',
        E'\\n', coalesce(v.request_no, '-'),
        to_char(v.nominal, 'FM999,999,999'), E'\\n', v.id::text
      ),
      gen_random_uuid()
    );
  end if;

  return jsonb_build_object('status', 'updated', 'row', to_jsonb(v));
end
$function$;

create or replace function public.aist_refresh_invoice_for_request_id(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_branch_id uuid;
  v_date date;
  v_processed boolean;
begin
  select r.branch_id,
         (r.requested_at at time zone coalesce(nullif(b.timezone, ''), 'Asia/Jakarta'))::date,
         r.is_processed
    into v_branch_id, v_date, v_processed
  from public.raos_saldo_requests r
  join public.branches b on b.id = r.branch_id
  where r.id = p_request_id;

  if not found or not coalesce(v_processed, false) then
    return;
  end if;

  perform public.aist_refresh_invoice_daily(v_branch_id, v_date);
end
$function$;

create or replace function public.aist_invoice_refresh_saldo_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_old_date date;
begin
  if tg_op = 'UPDATE' and old.is_processed then
    if old.branch_id is distinct from new.branch_id
       or old.requested_at is distinct from new.requested_at
       or old.is_processed is distinct from new.is_processed then
      select (old.requested_at at time zone coalesce(nullif(b.timezone, ''), 'Asia/Jakarta'))::date
        into v_old_date
      from public.branches b
      where b.id = old.branch_id;

      if v_old_date is not null then
        perform public.aist_refresh_invoice_daily(old.branch_id, v_old_date);
      end if;
    end if;
  end if;

  if new.is_processed then
    perform public.aist_refresh_invoice_for_request_id(new.id);
  end if;

  return new;
end
$function$;

drop trigger if exists trg_aist_invoice_refresh_saldo on public.raos_saldo_requests;
create trigger trg_aist_invoice_refresh_saldo
after insert or update of is_processed, branch_id, requested_at, nominal, driver_login_id
on public.raos_saldo_requests
for each row
execute function public.aist_invoice_refresh_saldo_trigger();

create or replace function public.aist_invoice_refresh_job_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if tg_op = 'DELETE' then
    perform public.aist_refresh_invoice_for_request_id(old.request_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.request_id is distinct from new.request_id then
    perform public.aist_refresh_invoice_for_request_id(old.request_id);
  end if;

  perform public.aist_refresh_invoice_for_request_id(new.request_id);
  return new;
end
$function$;

drop trigger if exists trg_aist_invoice_refresh_job on public.aist_jobs;
create trigger trg_aist_invoice_refresh_job
after insert or update or delete
on public.aist_jobs
for each row
execute function public.aist_invoice_refresh_job_trigger();

create or replace function public.aist_validate_invoice_daily(
  p_validation_id uuid,
  p_action text,
  p_note text default null
)
returns public.aist_invoice_daily_validation
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_profile public.user_profiles;
  v_row public.aist_invoice_daily_validation;
  v_role text;
begin
  select * into v_profile
  from public.user_profiles
  where id = auth.uid() and is_active = true;

  if not found then
    raise exception 'invoice_write_role_required';
  end if;

  select * into v_row
  from public.aist_invoice_daily_validation
  where id = p_validation_id
  for update;

  if not found then
    raise exception 'validation_not_found';
  end if;

  v_role := lower(coalesce(v_profile.role, ''));

  if v_role in ('admin', 'direksi', 'direktur') then
    null;
  elsif v_role = 'koordinator' then
    if not public.is_branch_in_scope(v_row.branch_id) then
      raise exception 'invoice_branch_scope_denied';
    end if;
  else
    raise exception 'invoice_write_role_required';
  end if;

  if p_action = 'validate' then
    if v_row.total_transactions <= 0
       or v_row.mismatch_count > 0
       or v_row.aist_valid_count <> v_row.total_transactions then
      raise exception 'cannot_validate_with_mismatch';
    end if;

    update public.aist_invoice_daily_validation
    set status = 'validated',
        validated_by = auth.uid(),
        validated_at = now(),
        correction_note = null,
        updated_at = now()
    where id = p_validation_id
    returning * into v_row;

  elsif p_action = 'correction' then
    update public.aist_invoice_daily_validation
    set status = 'correction_requested',
        validated_by = auth.uid(),
        validated_at = now(),
        correction_note = nullif(trim(p_note), ''),
        updated_at = now()
    where id = p_validation_id
    returning * into v_row;

  else
    raise exception 'invalid_action';
  end if;

  return v_row;
end
$function$;

-- Backfill invoice rows only. Historical AIST job statuses are intentionally
-- left untouched so old timeout/queued records remain visible as mismatch
-- instead of being silently reclassified as successful.
do $backfill$
declare
  rec record;
begin
  for rec in
    select distinct
      r.branch_id,
      (r.requested_at at time zone coalesce(nullif(b.timezone, ''), 'Asia/Jakarta'))::date as invoice_date
    from public.raos_saldo_requests r
    join public.branches b on b.id = r.branch_id
    where r.is_processed = true
  loop
    perform public.aist_refresh_invoice_daily(rec.branch_id, rec.invoice_date);
  end loop;
end
$backfill$;
