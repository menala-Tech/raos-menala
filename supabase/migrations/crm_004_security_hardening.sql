begin;

drop policy if exists crm_contacts_read on public.crm_contacts;
drop policy if exists crm_contacts_read_privileged on public.crm_contacts;
drop policy if exists crm_contacts_write on public.crm_contacts;
drop policy if exists crm_contacts_write_privileged on public.crm_contacts;

create policy crm_contacts_read_privileged
on public.crm_contacts
for select
to authenticated
using (public.get_my_role() = any (array['admin'::text,'management'::text,'direksi'::text,'direktur'::text]));

create policy crm_contacts_write_privileged
on public.crm_contacts
for all
to authenticated
using (public.get_my_role() = any (array['admin'::text,'direksi'::text,'direktur'::text]))
with check (public.get_my_role() = any (array['admin'::text,'direksi'::text,'direktur'::text]));

drop policy if exists config_admin_write on public.system_config;
create policy config_admin_write
on public.system_config
for all
to authenticated
using (public.get_my_role() = any (array['admin'::text,'direksi'::text,'direktur'::text]))
with check (public.get_my_role() = any (array['admin'::text,'direksi'::text,'direktur'::text]));

revoke execute on function public.set_system_config(text,text) from public, anon;
revoke execute on function public.log_crm_action(text,text,text,jsonb,jsonb,jsonb) from public, anon, authenticated;
revoke execute on function public._trg_crm_contacts_audit() from public, anon, authenticated;
revoke execute on function public.list_system_config() from public, anon;

grant execute on function public.list_system_config() to authenticated;
grant execute on function public.set_system_config(text,text) to authenticated;
grant execute on function public.log_crm_action(text,text,text,jsonb,jsonb,jsonb) to service_role;

create or replace function public.set_system_config(p_key text, p_value text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_before text;
  v_row_id uuid;
begin
  v_role := public.get_my_role();
  if v_role not in ('admin','direksi','direktur') then
    raise exception 'Permission denied: role % tidak boleh edit system_config', v_role;
  end if;
  if p_key is null or length(trim(p_key)) = 0 then
    raise exception 'Key wajib diisi';
  end if;
  select id, value into v_row_id, v_before from public.system_config where key = p_key limit 1;
  if v_row_id is null then
    insert into public.system_config (key, value, updated_at)
    values (p_key, p_value, now()) returning id into v_row_id;
  else
    update public.system_config set value = p_value, updated_at = now() where id = v_row_id;
  end if;
  perform public.log_crm_action(
    case when v_before is null then 'add' else 'edit' end,
    'system_config', p_key,
    case when v_before is null then null else jsonb_build_object('value', v_before) end,
    jsonb_build_object('value', p_value), '{}'::jsonb
  );
  return jsonb_build_object('id', v_row_id, 'key', p_key, 'value', p_value);
end;
$$;

commit;
