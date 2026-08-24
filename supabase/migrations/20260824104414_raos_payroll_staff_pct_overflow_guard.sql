-- raos_payroll_staff_pct_overflow_guard (2026-08-24)
--
-- Source-only migration. Do not apply to production until preview/UAT approval.
--
-- The actual target_pct calculation lives in
-- public.raos_compute_payroll_staff_row(date, uuid). The monthly RPC delegates
-- to that helper, so this migration patches the helper directly.
--
-- Fix:
--   * Keep raos_payroll.target_pct as numeric(6,2).
--   * Clamp the persisted percentage to numeric(6,2)'s max value, 9999.99.
--   * Round to 2 decimals before insert/update.
--   * Keep all target/realization/KPI threshold business rules unchanged.

do $do$
declare
  fn text;
  patched text;
begin
  fn := pg_get_functiondef('public.raos_compute_payroll_staff_row(date, uuid)'::regprocedure);

  if position('LEAST(9999.99, ROUND(' in fn) > 0 then
    return;
  end if;

  patched := replace(fn,
    E'  v_staff_pct := case when coalesce(v_target_staff, 0) > 0\n    then v_realisasi / v_target_staff::numeric * 100\n    else 0\n  end;',
    E'  v_staff_pct := case when coalesce(v_target_staff, 0) > 0\n    then LEAST(9999.99, ROUND((v_realisasi::numeric / NULLIF(v_target_staff, 0)::numeric) * 100, 2))\n    else 0\n  end;');

  if patched = fn then
    raise exception 'expected v_staff_pct calculation not found in public.raos_compute_payroll_staff_row(date, uuid)';
  end if;

  execute patched;
end;
$do$;
