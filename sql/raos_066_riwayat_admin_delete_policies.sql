-- raos_066_riwayat_admin_delete_policies.sql
--
-- Feedback user 1 Agustus 2026: admin butuh tombol Hapus untuk item riwayat
-- (scan_orders, raos_attendance, raos_saldo_requests). Sebelumnya tidak ada
-- DELETE policy sama sekali di 3 tabel ini -> silent 0 rows delete.
--
-- Policy: admin/direksi boleh DELETE row apa saja (audit). Koordinator/
-- management TIDAK boleh delete (mereka cukup Ubah Status via existing
-- UPDATE policy).

CREATE POLICY scan_orders_admin_delete ON public.scan_orders
  FOR DELETE TO authenticated
  USING (get_my_role() = ANY (ARRAY['admin', 'direksi']));

CREATE POLICY raos_attendance_admin_delete ON public.raos_attendance
  FOR DELETE TO authenticated
  USING (get_my_role() = ANY (ARRAY['admin', 'direksi']));

CREATE POLICY raos_saldo_requests_admin_delete ON public.raos_saldo_requests
  FOR DELETE TO authenticated
  USING (get_my_role() = ANY (ARRAY['admin', 'direksi']));
