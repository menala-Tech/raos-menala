-- RAOS 097 — late-minute calculation must use branch-local time and handle overnight shifts.
-- The existing trigger cast timestamptz::time in the database session timezone,
-- which made WITA/WIB attendance disagree with the RPC status calculation.

create or replace function public.raos_attendance_compute_late()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift_start time;
  v_shift_end time;
  v_rate numeric := 10000;
  v_interval int := 30;
  v_check_in timestamptz;
  v_timezone text := 'Asia/Jakarta';
  v_local_time time;
  v_diff_minutes int := 0;
begin
  v_check_in := coalesce(new.check_in_at_override, new.check_in_at);
  if v_check_in is null or new.shift_id is null then
    new.late_minutes := 0;
    new.late_deduction_idr := 0;
    return new;
  end if;

  select s.start_time, s.end_time
    into v_shift_start, v_shift_end
    from public.shifts s
    where s.id = new.shift_id;

  if v_shift_start is null then
    new.late_minutes := 0;
    new.late_deduction_idr := 0;
    return new;
  end if;

  select coalesce(b.timezone,'Asia/Jakarta')
    into v_timezone
    from public.branches b
    where b.id = new.branch_id;

  v_timezone := coalesce(v_timezone, 'Asia/Jakarta');
  v_local_time := (v_check_in at time zone v_timezone)::time;

  if v_shift_end is not null and v_shift_start > v_shift_end and v_local_time < v_shift_end then
    v_diff_minutes := ((extract(epoch from v_local_time)::int + 86400) - extract(epoch from v_shift_start)::int) / 60;
  else
    v_diff_minutes := (extract(epoch from v_local_time)::int - extract(epoch from v_shift_start)::int) / 60;
  end if;

  new.late_minutes := greatest(0, v_diff_minutes);

  select coalesce((select value::numeric from public.system_config where key='LATE_DEDUCTION_RATE_IDR'), 10000)
    into v_rate;
  select coalesce((select value::int from public.system_config where key='LATE_DEDUCTION_INTERVAL_MIN'), 30)
    into v_interval;

  new.late_deduction_idr := ceil(new.late_minutes::numeric / v_interval) * v_rate;
  return new;
end;
$$;
