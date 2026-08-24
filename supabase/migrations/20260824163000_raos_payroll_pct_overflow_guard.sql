-- raos_payroll_pct_overflow_guard (2026-08-24)
--
-- Problem: public.raos_compute_payroll_month computes v_staff_pct as an
-- unbounded numeric percentage and inserts it into raos_payroll.target_pct,
-- which is typed numeric(6,2). When realisasi exceeds 100x the target,
-- PostgreSQL raises "numeric field overflow" and the whole payroll compute
-- aborts for the entire month.
--
-- Fix (no business logic changes):
--   * Clamp v_staff_pct to 9999.99 before the INSERT/UPDATE.
--   * Guard the division with NULLIF(v_target_staff, 0) so a zero target
--     cannot produce a division-by-zero error.
--   * Keep raos_payroll.target_pct as numeric(6,2).

do $do$
declare
  fn text;
begin
  fn := pg_get_functiondef('public.raos_compute_payroll_month(date)'::regprocedure);
  fn := replace(fn,
    E'  v_staff_pct := case when coalesce(v_target_staff, 0) > 0\n    then v_realisasi / v_target_staff::numeric * 100\n    else 0\n  end;',
    E'  v_staff_pct := case when coalesce(v_target_staff, 0) > 0\n    then LEAST(v_realisasi / NULLIF(v_target_staff, 0)::numeric * 100, 9999.99)\n    else 0\n  end;');
  execute fn;
end;
$do$;
