-- RAOS 099z — zero-downtime Scan RPC rollout transition.
-- Apply BEFORE raos_100. Renames the current legacy Staff INSERT policy so
-- raos_100's historical DROP POLICY IF EXISTS scan_orders_staff_insert does
-- not remove it while production clients may still be on the previous build.

alter policy scan_orders_staff_insert on public.scan_orders
  rename to scan_orders_staff_insert_transition;
