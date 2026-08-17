-- RAOS Driver Master Read-Only Hardening Draft
-- Date: 2026-08-17
-- STATUS: DRAFT ONLY — NOT APPLIED TO PRODUCTION.
--
-- Evidence before this draft:
-- - Canonical deployed writer: public.raos_sync_driver_ssot(p_source,p_records)
-- - EXECUTE granted only to postgres + service_role.
-- - Canonical sync writes raos_driver_ssot_records -> raos_drivers.
-- - Authenticated users still have table-level DML grants and policy
--   raos_drivers_admin_manage (ALL) for admin/direksi/direktur.
-- - PWA /drivers direct master CRUD has already been removed on audit branch.
--
-- Goal:
-- authenticated users can READ scoped Driver master only.
-- The service-role canonical SSOT sync remains the only writer.
-- Queue, assignments, saldo, scan and other operational mutations live in
-- their own tables/RPCs and are not changed by this draft.

begin;

-- Remove authenticated direct master mutation policy.
drop policy if exists raos_drivers_admin_manage on public.raos_drivers;

-- Defense in depth at GRANT layer. Keep SELECT for authenticated consumers.
revoke insert, update, delete, truncate on table public.raos_drivers from authenticated;
grant select on table public.raos_drivers to authenticated;

-- Preserve service role writer privileges explicitly.
grant select, insert, update, delete on table public.raos_drivers to service_role;

commit;

-- PRE-APPLY VERIFICATION (read-only):
-- 1) Confirm deployed raos_sync_driver_ssot still EXECUTE only postgres/service_role.
-- 2) Confirm no authenticated SECURITY INVOKER function writes raos_drivers.
-- 3) Confirm /drivers, /admin/barcodes, queue, saldo, scan all use read/RPC paths.
-- 4) Run role E2E on preview with Admin/Direksi/Management/Koordinator/Staff/Driver.
--
-- POST-APPLY VERIFICATION (only after explicit production authorization):
-- - Admin/Direksi SELECT raos_drivers succeeds.
-- - Direct INSERT/UPDATE/DELETE with authenticated JWT fails.
-- - GAS Driver Airport/External sync still updates canonical rows.
-- - Queue/assignment/saldo/scan flows remain functional.
