-- RAOS Driver Master Read-Only Hardening Draft
-- Date: 2026-08-17
-- STATUS: DRAFT ONLY — NOT APPLIED TO PRODUCTION.
--
-- Evidence before this draft:
-- - Canonical deployed writer: public.raos_sync_driver_ssot(p_source,p_records)
-- - EXECUTE granted only to postgres + service_role.
-- - Canonical sync writes raos_driver_ssot_records -> raos_drivers.
-- - Authenticated currently has broad table privileges and policy
--   raos_drivers_admin_manage (ALL) for admin/direksi/direktur.
-- - Existing SELECT policies remain valid:
--   * raos_drivers_read_scoped
--   * raos_drivers_driver_read_own
-- - Production function audit confirms only raos_sync_driver_ssot performs
--   INSERT/UPDATE against raos_drivers; queue/saldo/assignment helpers only read it.
-- - PWA /drivers direct master CRUD has already been removed on audit branch.
--
-- Goal:
-- authenticated users can only SELECT Driver master according to existing RLS.
-- The service-role canonical SSOT sync remains the only writer.
-- Queue, assignments, saldo, scan and other operational mutations live in
-- their own tables/RPCs and are not changed by this draft.

begin;

-- Remove authenticated direct master mutation policy only.
-- Existing scoped/own SELECT policies are intentionally preserved.
drop policy if exists raos_drivers_admin_manage on public.raos_drivers;

-- Defense in depth at GRANT layer: authenticated gets SELECT only.
-- This also removes stale REFERENCES/TRIGGER privileges, not just DML.
revoke all privileges on table public.raos_drivers from authenticated;
grant select on table public.raos_drivers to authenticated;

-- Preserve canonical service-role writer privileges explicitly.
grant all privileges on table public.raos_drivers to service_role;

commit;

-- PRE-APPLY VERIFICATION (read-only):
-- 1) Confirm raos_sync_driver_ssot EXECUTE remains postgres/service_role only.
-- 2) Confirm only raos_sync_driver_ssot writes raos_drivers.
-- 3) Confirm raos_drivers_read_scoped + raos_drivers_driver_read_own remain present.
-- 4) Confirm /drivers + /admin/barcodes are read-only master consumers.
-- 5) Confirm queue, saldo, scan and assignments mutate their own tables/RPCs.
-- 6) Run six-role authorization contract + isolated write/readback E2E.
--
-- POST-APPLY VERIFICATION (only after explicit production authorization):
-- - Admin/Direksi/Management scoped SELECT succeeds per existing RLS.
-- - Staff/Koordinator scoped SELECT succeeds only in branch scope.
-- - Driver own-row SELECT still succeeds through raos_drivers_driver_read_own.
-- - Direct INSERT/UPDATE/DELETE/TRUNCATE with authenticated JWT fails.
-- - GAS Driver Airport/External sync still updates canonical rows via service_role.
-- - Queue/assignment/saldo/scan flows remain functional.
