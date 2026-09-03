-- raos_130_attendance_write_guard_service_role_fix.sql
-- 2026-09-03 — Fix trigger raos_attendance_write_guard supaya bypass juga
-- saat koneksi service_role menggunakan sb_secret_* (bukan JWT lama).
--
-- Gejala: HRIS admin panel /modules/hris tekan "Bersihkan Data → Permanent
-- Delete" mendapat error "attendance_delete_not_allowed" walau role admin
-- valid & migration 20260903000000_admin_direksi_delete_policies sudah pass
-- (RLS policy DELETE utk admin+direksi sudah ada). Root cause di trigger
-- ini yang cek jwtrole = 'service_role' saja — untuk key baru sb_secret_*
-- request.jwt.claim.role kosong sehingga fall-through ke get_my_role(),
-- yg return NULL karena auth.uid() NULL untuk service key → RAISE.
--
-- Perbaikan: tambah cek current_user IN ('service_role','postgres',
-- 'supabase_admin') supaya call server-side lewat sb_secret_* juga bypass.
-- Sumber trigger asli: .supabase-prod/supabase/schemas/public/functions/
-- raos_attendance_write_guard.sql

create or replace function public.raos_attendance_write_guard()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
  AS $function$
declare
  r text := lower(coalesce(public.get_my_role(), ''));
  jwtrole text := coalesce(current_setting('request.jwt.claim.role', true), '');
  is_service boolean := (
    jwtrole = 'service_role'
    or current_user in ('service_role','postgres','supabase_admin')
  );
  v_branch uuid;
begin
  if is_service then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  if tg_op='DELETE' then
    if r not in ('admin','direksi','direktur') then
      raise exception 'attendance_delete_not_allowed';
    end if;
    return old;
  end if;

  if r='staff' then
    select branch_id into v_branch from public.user_profiles where id=auth.uid() and is_active=true;
    if new.staff_id is distinct from auth.uid() then raise exception 'attendance_staff_mismatch'; end if;
    if new.branch_id is distinct from v_branch then raise exception 'attendance_branch_mismatch'; end if;

    if tg_op='INSERT' then
      if lower(coalesce(new.status,'hadir')) not in ('hadir','terlambat') then
        raise exception 'attendance_status_not_allowed';
      end if;
      if new.check_in_at is null then
        raise exception 'attendance_check_in_required';
      end if;
      if new.date is distinct from (timezone(
           coalesce((select b.timezone from public.branches b where b.id=v_branch),'Asia/Jakarta'),
           new.check_in_at
         ))::date then
        raise exception 'attendance_date_mismatch';
      end if;
      if new.check_out_at is not null or new.check_out_lat is not null or new.check_out_lng is not null
         or new.selfie_out_url is not null then
        raise exception 'attendance_checkout_must_be_separate';
      end if;
      if new.manual_edited_by is not null or new.manual_edited_at is not null or new.edit_reason is not null
         or new.check_in_at_override is not null or new.check_out_at_override is not null
         or coalesce(new.auto_checkout,false) or coalesce(new.selfie_in_drive_synced,false)
         or coalesce(new.selfie_out_drive_synced,false) then
        raise exception 'attendance_server_fields_not_allowed';
      end if;
    else
      if new.staff_id is distinct from old.staff_id
         or new.branch_id is distinct from old.branch_id
         or new.date is distinct from old.date
         or new.created_at is distinct from old.created_at then
        raise exception 'attendance_identity_fields_immutable';
      end if;
      if new.pickup_point_id is distinct from old.pickup_point_id
         or new.shift_id is distinct from old.shift_id
         or new.check_in_at is distinct from old.check_in_at
         or new.check_in_lat is distinct from old.check_in_lat
         or new.check_in_lng is distinct from old.check_in_lng
         or new.selfie_in_url is distinct from old.selfie_in_url
         or new.status is distinct from old.status
         or new.is_location_valid is distinct from old.is_location_valid then
        raise exception 'attendance_checkin_fields_immutable';
      end if;
      if old.check_out_at is not null and new.check_out_at is distinct from old.check_out_at then
        raise exception 'attendance_checkout_already_set';
      end if;
      if old.selfie_out_url is not null and new.selfie_out_url is distinct from old.selfie_out_url then
        raise exception 'attendance_checkout_already_set';
      end if;
      if new.manual_edited_by is distinct from old.manual_edited_by
         or new.manual_edited_at is distinct from old.manual_edited_at
         or new.edit_reason is distinct from old.edit_reason
         or new.check_in_at_override is distinct from old.check_in_at_override
         or new.check_out_at_override is distinct from old.check_out_at_override
         or new.auto_checkout is distinct from old.auto_checkout
         or new.selfie_in_drive_synced is distinct from old.selfie_in_drive_synced
         or new.selfie_out_drive_synced is distinct from old.selfie_out_drive_synced
         or new.late_minutes is distinct from old.late_minutes
         or new.late_deduction_idr is distinct from old.late_deduction_idr then
        raise exception 'attendance_server_fields_immutable';
      end if;
    end if;
    return new;
  end if;

  if r not in ('admin','direksi','direktur') then
    raise exception 'attendance_write_not_allowed: role % is view-only', r;
  end if;
  return new;
end $function$;
