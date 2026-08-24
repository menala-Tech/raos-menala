-- RAOS staff order target override contract
-- 2026-08-24
--
-- Source-only migration. Do not apply to production until preview/UAT approval.
--
-- Adds the per-staff order/scan target override consumed by
-- raos_compute_payroll_* when raos_kpi_targets_branch.mode = 'order'.
-- NULL means inherit branch target_staff_default, then the existing CEIL
-- auto-prorated branch target. The existing saldo override remains
-- raos_kpi_targets_staff.target_saldo.

alter table public.raos_kpi_targets_staff
  add column if not exists target_order bigint;

comment on column public.raos_kpi_targets_staff.target_order is
  'Explicit monthly order/scan target for a Staff. NULL means inherit branch default or derived equal-share branch target.';
