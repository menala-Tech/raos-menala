-- ─────────────────────────────────────────────────────────────────────────
-- RAOS 064 — Notification Engine F4: dashboard metrics.
-- View + RPC untuk aggregate stats per day (30 hari) + summary totals.
-- Konsumsi: panel NotificationStatsPanel di /admin.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.raos_notification_stats_daily AS
  SELECT
    date_trunc('day', created_at AT TIME ZONE 'Asia/Jakarta')::date AS day,
    COUNT(*)                                        AS total,
    COUNT(*) FILTER (WHERE status = 'sent')         AS sent,
    COUNT(*) FILTER (WHERE status = 'delivered')    AS delivered,
    COUNT(*) FILTER (WHERE status = 'read')         AS read_count,
    COUNT(*) FILTER (WHERE status = 'archived')     AS archived,
    COUNT(*) FILTER (WHERE status = 'expired')      AS expired,
    COUNT(*) FILTER (WHERE priority = 'critical')   AS critical_count,
    COUNT(*) FILTER (WHERE priority = 'high')       AS high_count
  FROM public.notifications
  WHERE created_at >= now() - interval '30 days'
  GROUP BY 1
  ORDER BY 1 DESC;

GRANT SELECT ON public.raos_notification_stats_daily TO authenticated;

CREATE OR REPLACE FUNCTION public.raos_notification_stats_summary(p_days int DEFAULT 7)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_role text; v_uid uuid := auth.uid();
  v_since timestamptz;
  v_scope_all boolean;
  v_total int; v_sent int; v_delivered int; v_read int; v_archived int; v_expired int;
  v_pending int; v_failed int;
  v_critical int; v_high int;
  v_by_payload jsonb; v_by_day jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT role INTO v_role FROM user_profiles WHERE id = v_uid;
  v_scope_all := (v_role IN ('admin','management','direksi'));
  v_since := now() - (GREATEST(1, LEAST(p_days, 90)) || ' days')::interval;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'sent'),
    COUNT(*) FILTER (WHERE status = 'delivered'),
    COUNT(*) FILTER (WHERE status = 'read'),
    COUNT(*) FILTER (WHERE status = 'archived'),
    COUNT(*) FILTER (WHERE status = 'expired'),
    COUNT(*) FILTER (WHERE status IN ('sent','delivered') AND is_read = false),
    COUNT(*) FILTER (WHERE priority = 'critical'),
    COUNT(*) FILTER (WHERE priority = 'high')
  INTO v_total, v_sent, v_delivered, v_read, v_archived, v_expired, v_pending, v_critical, v_high
  FROM notifications
  WHERE created_at >= v_since AND (v_scope_all OR user_id = v_uid);

  SELECT COUNT(*) INTO v_failed FROM notification_delivery_log dl
   WHERE dl.attempted_at >= v_since AND dl.status = 'failed'
     AND (v_scope_all OR EXISTS (SELECT 1 FROM notifications n WHERE n.id = dl.notification_id AND n.user_id = v_uid));

  SELECT jsonb_object_agg(COALESCE(payload_type, type, 'system'), cnt)
    INTO v_by_payload
    FROM (
      SELECT COALESCE(payload_type, type, 'system') AS payload_type, COUNT(*) AS cnt
        FROM notifications
       WHERE created_at >= v_since AND (v_scope_all OR user_id = v_uid)
       GROUP BY 1
    ) x;

  SELECT jsonb_agg(row_to_json(d) ORDER BY day)
    INTO v_by_day
    FROM (
      SELECT
        date_trunc('day', created_at AT TIME ZONE 'Asia/Jakarta')::date AS day,
        COUNT(*)                                      AS total,
        COUNT(*) FILTER (WHERE status = 'read')       AS read_count,
        COUNT(*) FILTER (WHERE priority IN ('critical','high')) AS priority_count
      FROM notifications
      WHERE created_at >= now() - interval '7 days'
        AND (v_scope_all OR user_id = v_uid)
      GROUP BY 1
    ) d;

  RETURN jsonb_build_object(
    'scope', CASE WHEN v_scope_all THEN 'all' ELSE 'own' END,
    'window_days', GREATEST(1, LEAST(p_days, 90)),
    'total', v_total, 'sent', v_sent, 'delivered', v_delivered,
    'read', v_read, 'archived', v_archived, 'expired', v_expired,
    'pending', v_pending, 'failed', v_failed,
    'critical', v_critical, 'high', v_high,
    'read_rate_pct', CASE WHEN v_total > 0 THEN round((v_read::numeric / v_total) * 100, 1) ELSE 0 END,
    'delivery_rate_pct', CASE WHEN v_total > 0 THEN round(((v_total - v_failed)::numeric / v_total) * 100, 1) ELSE 100 END,
    'by_payload', COALESCE(v_by_payload, '{}'::jsonb),
    'by_day', COALESCE(v_by_day, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.raos_notification_stats_summary(int) TO authenticated;
