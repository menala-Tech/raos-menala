-- RAOS 101 — FINAL CUTOVER ONLY.
-- Apply ONLY after PR #95 frontend/offline replay is live and verified.
-- Removes the legacy raw Staff INSERT path so all Staff Scan Order writes
-- must pass through raos_submit_scan(). Admin/Direksi policies remain.

drop policy if exists scan_orders_staff_insert on public.scan_orders;
drop policy if exists scan_orders_staff_insert_transition on public.scan_orders;
