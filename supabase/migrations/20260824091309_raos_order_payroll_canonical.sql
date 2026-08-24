-- RAOS order payroll canonicalization
-- 2026-08-24
--
-- Source-only migration. Do not apply to production until preview/UAT approval.
--
-- Goal:
--   mode = saldo: preserve existing saldo realization semantics.
--   mode = order: compute payroll target realization from canonical valid
--   scan_orders rows, using the selected payroll month in the staff branch
--   timezone. Saldo request counts must not inflate order-mode target_pct,
--   bonus_saldo, or bonus_kpi.

create or replace function public.raos_compute_payroll_staff_row(
  p_month date,
  p_staff_id uuid
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text;
  v_month_start date := date_trunc('month', p_month)::date;
  v_month_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_min_active_days integer := 25;
  r record;
  v_target public.raos_kpi_targets_branch%rowtype;
  v_target_staff bigint := 0;
  v_realisasi numeric := 0;
  v_staff_pct numeric := 0;
  v_cabang_pct numeric := 0;
  v_staff_capai_count integer := 0;
  v_staff_total_count integer := 0;
  v_driver_active_ratio numeric := 0;
  v_bonus_saldo_max integer := 0;
  v_bonus_saldo integer := 0;
  v_bonus_kpi integer := 0;
  v_gapok integer := 0;
  v_status text := 'cut_off';
  v_member_parkir integer := 0;
  v_late_ded integer := 0;
  v_branch_staff_count integer := 0;
  v_effective_default bigint := 0;
  v_target_branch_id uuid;
  v_scope_ids uuid[];
  v_mode text := 'saldo';
  v_tz text := 'Asia/Jakarta';
  v_order_start_ts timestamptz;
  v_order_end_ts timestamptz;
begin
  v_role := public.get_my_role();
  if not (v_role = any (array['admin','management','direksi'])) and auth.role() <> 'service_role' then
    raise exception 'Only admin/management/direksi can compute payroll';
  end if;

  select
    up.id as staff_id,
    up.role,
    up.branch_id,
    up.gaji,
    b.slug as branch_slug,
    b.name as branch_name,
    b.parent_branch_id,
    coalesce(nullif(b.timezone, ''), 'Asia/Jakarta') as branch_timezone
  into r
  from public.user_profiles up
  join public.branches b on b.id = up.branch_id
  where up.id = p_staff_id
    and up.is_active = true
    and up.role = any (array['staff','koordinator'])
    and up.branch_id is not null;

  if not found then
    return 0;
  end if;

  v_gapok := coalesce(r.gaji, 0)::integer;
  v_tz := coalesce(nullif(r.branch_timezone, ''), 'Asia/Jakarta');
  v_target_branch_id := coalesce(r.parent_branch_id, r.branch_id);
  v_scope_ids := public.raos_branch_geofence_scope(v_target_branch_id);
  v_order_start_ts := v_month_start::timestamp at time zone v_tz;
  v_order_end_ts := (v_month_start + interval '1 month')::timestamp at time zone v_tz;

  select * into v_target
  from public.raos_kpi_targets_branch
  where branch_id = v_target_branch_id
    and effective_month = v_month_start
  limit 1;

  v_mode := case when coalesce(v_target.mode, 'saldo') = 'order' then 'order' else 'saldo' end;
  v_effective_default := v_target.target_staff_default;

  if v_effective_default is null and coalesce(v_target.target_cabang, 0) > 0 then
    select count(*)::integer into v_branch_staff_count
    from public.user_profiles up2
    where up2.branch_id = any (v_scope_ids)
      and up2.is_active = true
      and up2.role = any (array['staff','koordinator']);

    if v_branch_staff_count > 0 then
      v_effective_default := ceil(v_target.target_cabang::numeric / v_branch_staff_count::numeric)::bigint;
    end if;
  end if;

  if v_mode = 'order' then
    select
      coalesce(st.target_order, v_effective_default, 0),
      coalesce(st.member_parkir_amount, 0)
    into v_target_staff, v_member_parkir
    from public.raos_kpi_targets_staff st
    where st.staff_id = r.staff_id
      and st.effective_month = v_month_start;

    if v_target_staff is null then
      v_target_staff := coalesce(v_effective_default, 0);
    end if;
    if v_member_parkir is null then
      v_member_parkir := 0;
    end if;

    select count(*)::numeric into v_realisasi
    from public.scan_orders s
    join public.user_profiles scan_staff on scan_staff.id = s.staff_id
    where s.staff_id = r.staff_id
      and scan_staff.branch_id = any (v_scope_ids)
      and s.status = 'valid'
      and s.scanned_at >= v_order_start_ts
      and s.scanned_at < v_order_end_ts;
  else
    select
      coalesce(st.target_saldo, v_effective_default, 0),
      coalesce(st.member_parkir_amount, 0)
    into v_target_staff, v_member_parkir
    from public.raos_kpi_targets_staff st
    where st.staff_id = r.staff_id
      and st.effective_month = v_month_start;

    if v_target_staff is null then
      v_target_staff := coalesce(v_effective_default, 0);
    end if;
    if v_member_parkir is null then
      v_member_parkir := 0;
    end if;

    select coalesce(t.realisasi_saldo, 0)::numeric into v_realisasi
    from public.raos_target_tercapai_bulan t
    where t.staff_id = r.staff_id
      and t.effective_month = v_month_start;
  end if;

  v_realisasi := coalesce(v_realisasi, 0);
  v_staff_pct := case when coalesce(v_target_staff, 0) > 0
    then v_realisasi / v_target_staff::numeric * 100
    else 0
  end;

  select
    count(*) filter (where realisasi >= tgt and tgt > 0),
    count(*)
  into v_staff_capai_count, v_staff_total_count
  from (
    select
      up2.id,
      case when v_mode = 'order' then
        coalesce(st2.target_order, v_effective_default, 0)
      else
        coalesce(st2.target_saldo, v_effective_default, 0)
      end as tgt,
      case when v_mode = 'order' then
        (
          select count(*)::numeric
          from public.scan_orders s2
          where s2.staff_id = up2.id
            and s2.status = 'valid'
            and s2.scanned_at >= v_order_start_ts
            and s2.scanned_at < v_order_end_ts
        )
      else
        coalesce((
          select t2.realisasi_saldo::numeric
          from public.raos_target_tercapai_bulan t2
          where t2.staff_id = up2.id
            and t2.effective_month = v_month_start
        ), 0)
      end as realisasi
    from public.user_profiles up2
    left join public.raos_kpi_targets_staff st2
      on st2.staff_id = up2.id
     and st2.effective_month = v_month_start
    where up2.branch_id = any (v_scope_ids)
      and up2.is_active = true
      and up2.role = any (array['staff','koordinator'])
  ) sub;

  v_cabang_pct := case when v_staff_total_count > 0
    then v_staff_capai_count::numeric / v_staff_total_count::numeric * 100
    else 0
  end;

  select coalesce(sum(late_deduction_idr), 0)::integer into v_late_ded
  from public.raos_attendance
  where staff_id = r.staff_id
    and date >= v_month_start
    and date <= v_month_end;

  if v_mode = 'order' then
    select
      case when count(*) > 0
        then count(*) filter (where coalesce(active_days, 0) >= v_min_active_days)::numeric / count(*)::numeric * 100
        else 0
      end
    into v_driver_active_ratio
    from (
      select
        a.driver_id,
        count(distinct (s.scanned_at at time zone v_tz)::date) as active_days
      from public.raos_driver_staff_assignment a
      left join public.scan_orders s
        on s.driver_id = a.driver_id
       and s.staff_id = a.staff_id
       and s.status = 'valid'
       and s.scanned_at >= v_order_start_ts
       and s.scanned_at < v_order_end_ts
      where a.staff_id = r.staff_id
      group by a.driver_id
    ) order_driver_days;
  else
    select
      case when count(*) > 0
        then count(*) filter (where coalesce(active_days, 0) >= v_min_active_days)::numeric / count(*)::numeric * 100
        else 0
      end
    into v_driver_active_ratio
    from public.raos_driver_active_days_bulan
    where staff_id = r.staff_id
      and effective_month = v_month_start;
  end if;

  v_driver_active_ratio := coalesce(v_driver_active_ratio, 0);

  v_bonus_saldo_max := case when r.role = 'koordinator' then 2000000 else 1500000 end;
  if v_cabang_pct >= 100 and v_staff_pct >= 100 then
    v_bonus_saldo := v_bonus_saldo_max;
  elsif v_cabang_pct >= 90 and v_staff_pct >= 90 then
    v_bonus_saldo := (v_bonus_saldo_max * 0.8)::integer;
  elsif v_cabang_pct >= 80 and v_staff_pct >= 80 then
    v_bonus_saldo := (v_bonus_saldo_max * 0.6)::integer;
  else
    v_bonus_saldo := 0;
  end if;

  if v_driver_active_ratio >= 100 then
    v_bonus_kpi := 300000;
  elsif v_driver_active_ratio >= 90 then
    v_bonus_kpi := 240000;
  elsif v_driver_active_ratio >= 80 then
    v_bonus_kpi := 180000;
  else
    v_bonus_kpi := 0;
  end if;

  if v_staff_pct >= 100 then
    v_status := 'ok';
  elsif v_staff_pct >= 80 then
    v_status := 'warning';
  else
    v_status := 'cut_off';
  end if;

  insert into public.raos_payroll (
    staff_id,
    effective_month,
    gapok,
    bonus_saldo,
    bpjs,
    paket_data,
    member_parkir,
    bonus_kpi,
    late_deduction_total,
    target_pct,
    driver_active_pct,
    status_target,
    computed_at,
    computed_by
  )
  values (
    r.staff_id,
    v_month_start,
    v_gapok,
    v_bonus_saldo,
    55000,
    100000,
    v_member_parkir,
    v_bonus_kpi,
    v_late_ded,
    coalesce(v_staff_pct, 0),
    coalesce(v_driver_active_ratio, 0),
    v_status,
    now(),
    auth.uid()
  )
  on conflict (staff_id, effective_month) do update set
    gapok = excluded.gapok,
    bonus_saldo = excluded.bonus_saldo,
    bpjs = excluded.bpjs,
    paket_data = excluded.paket_data,
    member_parkir = excluded.member_parkir,
    bonus_kpi = excluded.bonus_kpi,
    late_deduction_total = excluded.late_deduction_total,
    target_pct = excluded.target_pct,
    driver_active_pct = excluded.driver_active_pct,
    status_target = excluded.status_target,
    computed_at = now(),
    computed_by = auth.uid();

  return 1;
end
$function$;

create or replace function public.raos_compute_payroll_staff(
  p_month date,
  p_staff_id uuid
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_staff_id is null then
    raise exception 'staff_id_required';
  end if;

  return public.raos_compute_payroll_staff_row(p_month, p_staff_id);
end
$function$;

create or replace function public.raos_compute_payroll_month(p_month date)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text;
  v_processed integer := 0;
  r record;
begin
  v_role := public.get_my_role();
  if not (v_role = any (array['admin','management','direksi'])) and auth.role() <> 'service_role' then
    raise exception 'Only admin/management/direksi can compute payroll';
  end if;

  for r in
    select up.id as staff_id
    from public.user_profiles up
    where up.is_active = true
      and up.role = any (array['staff','koordinator'])
      and up.branch_id is not null
    order by up.full_name nulls last, up.id
  loop
    v_processed := v_processed + public.raos_compute_payroll_staff_row(p_month, r.staff_id);
  end loop;

  return v_processed;
end
$function$;

comment on function public.raos_compute_payroll_staff_row(date, uuid) is
  'Canonical one-staff RAOS payroll recompute. mode=saldo uses raos_target_tercapai_bulan; mode=order uses valid scan_orders in the selected branch-timezone month window. Upserts raos_payroll by (staff_id,effective_month).';

comment on function public.raos_compute_payroll_staff(date, uuid) is
  'Canonical one-staff RAOS payroll recompute wrapper used by Finance Target Staff auto-recompute.';

comment on function public.raos_compute_payroll_month(date) is
  'Canonical monthly RAOS payroll recompute. Delegates to raos_compute_payroll_staff_row so order/saldo realization semantics are identical for monthly and single-staff recompute.';

revoke all on function public.raos_compute_payroll_staff_row(date, uuid) from public, anon;
revoke all on function public.raos_compute_payroll_staff(date, uuid) from public, anon;
revoke all on function public.raos_compute_payroll_month(date) from public, anon;

grant execute on function public.raos_compute_payroll_staff_row(date, uuid) to authenticated, service_role;
grant execute on function public.raos_compute_payroll_staff(date, uuid) to authenticated, service_role;
grant execute on function public.raos_compute_payroll_month(date) to authenticated, service_role;
