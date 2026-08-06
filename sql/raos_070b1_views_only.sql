CREATE OR REPLACE VIEW public.raos_target_tercapai_bulan AS
SELECT
  staff_id,
  date_trunc('month', COALESCE(processed_at, created_at))::date AS effective_month,
  COUNT(*)::bigint AS request_count,
  SUM(nominal)::bigint AS realisasi_saldo
FROM public.raos_saldo_requests
WHERE is_processed = true
GROUP BY staff_id, effective_month;

CREATE OR REPLACE VIEW public.raos_driver_active_days_bulan AS
SELECT
  a.staff_id,
  date_trunc('month', s.processed_at)::date AS effective_month,
  a.driver_id,
  COUNT(DISTINCT date_trunc('day', s.processed_at)::date) AS active_days
FROM public.raos_driver_staff_assignment a
LEFT JOIN public.raos_saldo_requests s
  ON s.driver_id = a.driver_id
  AND s.is_processed = true
  AND s.processed_at IS NOT NULL
GROUP BY a.staff_id, effective_month, a.driver_id;
