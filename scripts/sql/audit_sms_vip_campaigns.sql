-- Audit recent SMS VIP campaigns against actual outbound rows.
-- Usage:
--   PGPASSWORD=$(cat ~/creds/supabase/db-password) \
--   psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres \
--   -f scripts/sql/audit_sms_vip_campaigns.sql

\echo ''
\echo '=== VIP Campaign Audit Settings ==='

WITH settings AS (
  SELECT
    (CURRENT_DATE - INTERVAL '60 days')::timestamptz AS campaign_window_start,
    (CURRENT_DATE - INTERVAL '60 days')::timestamptz AS event_window_start,
    (CURRENT_DATE + INTERVAL '21 days')::timestamptz AS event_window_end
)
SELECT
  campaign_window_start,
  event_window_start,
  event_window_end
FROM settings;

\echo ''
\echo '=== VIP Campaigns: Reported Vs Actual Sends ==='

WITH settings AS (
  SELECT (CURRENT_DATE - INTERVAL '60 days')::timestamptz AS campaign_window_start
),
vip_campaigns AS (
  SELECT
    c.id,
    c.created_at,
    c.name,
    e.eid,
    e.name AS event_name,
    e.event_start_datetime,
    c.total_recipients,
    c.messages_sent,
    COALESCE(c.messages_failed, 0) AS campaign_failed,
    COALESCE((c.metadata->>'duplicates_prevented')::int, 0) AS campaign_dupes
  FROM public.sms_marketing_campaigns c
  LEFT JOIN public.events e ON e.id = c.event_id
  CROSS JOIN settings s
  WHERE c.created_at >= s.campaign_window_start
    AND lower(c.name) LIKE '%vip%'
    AND lower(c.name) NOT LIKE '%no vip%'
),
outbound AS (
  SELECT
    campaign_id,
    COUNT(*) FILTER (WHERE status = 'sent') AS outbound_sent_rows,
    COUNT(DISTINCT to_phone) FILTER (WHERE status = 'sent') AS unique_sent_phones,
    COUNT(*) FILTER (WHERE status = 'failed') AS outbound_failed_rows
  FROM public.sms_outbound
  WHERE campaign_id IN (SELECT id FROM vip_campaigns)
  GROUP BY campaign_id
)
SELECT
  to_char(vc.created_at, 'YYYY-MM-DD') AS campaign_date,
  vc.eid,
  vc.event_name,
  vc.name AS campaign_name,
  vc.total_recipients,
  vc.messages_sent AS reported_sent,
  COALESCE(o.unique_sent_phones, 0) AS actual_sent,
  vc.campaign_failed AS reported_failed,
  COALESCE(o.outbound_failed_rows, 0) AS actual_failed,
  vc.campaign_dupes AS reported_dupes,
  ROUND(100.0 * COALESCE(o.unique_sent_phones, 0) / NULLIF(vc.total_recipients, 0), 1) AS actual_sent_pct
FROM vip_campaigns vc
LEFT JOIN outbound o ON o.campaign_id = vc.id
ORDER BY vc.created_at DESC;

\echo ''
\echo '=== VIP Campaigns With Counter Drift ==='

WITH settings AS (
  SELECT (CURRENT_DATE - INTERVAL '60 days')::timestamptz AS campaign_window_start
),
vip_campaigns AS (
  SELECT
    c.id,
    c.name,
    e.eid,
    e.name AS event_name,
    c.messages_sent,
    COALESCE(c.messages_failed, 0) AS campaign_failed,
    COALESCE((c.metadata->>'duplicates_prevented')::int, 0) AS campaign_dupes
  FROM public.sms_marketing_campaigns c
  LEFT JOIN public.events e ON e.id = c.event_id
  CROSS JOIN settings s
  WHERE c.created_at >= s.campaign_window_start
    AND lower(c.name) LIKE '%vip%'
    AND lower(c.name) NOT LIKE '%no vip%'
),
outbound AS (
  SELECT
    campaign_id,
    COUNT(*) FILTER (WHERE status = 'sent') AS outbound_sent_rows,
    COUNT(*) FILTER (WHERE status = 'failed') AS outbound_failed_rows
  FROM public.sms_outbound
  WHERE campaign_id IN (SELECT id FROM vip_campaigns)
  GROUP BY campaign_id
)
SELECT
  vc.eid,
  vc.event_name,
  vc.name AS campaign_name,
  vc.messages_sent AS reported_sent,
  COALESCE(o.outbound_sent_rows, 0) AS outbound_sent_rows,
  vc.campaign_failed AS reported_failed,
  COALESCE(o.outbound_failed_rows, 0) AS outbound_failed_rows,
  vc.campaign_dupes AS reported_dupes
FROM vip_campaigns vc
LEFT JOIN outbound o ON o.campaign_id = vc.id
WHERE COALESCE(o.outbound_sent_rows, 0) <> vc.messages_sent
   OR COALESCE(o.outbound_failed_rows, 0) <> vc.campaign_failed
ORDER BY GREATEST(
  ABS(COALESCE(o.outbound_sent_rows, 0) - vc.messages_sent),
  ABS(COALESCE(o.outbound_failed_rows, 0) - vc.campaign_failed)
) DESC;

\echo ''
\echo '=== Recent Events With Broad Campaign But No VIP Campaign ==='

WITH settings AS (
  SELECT
    (CURRENT_DATE - INTERVAL '60 days')::timestamptz AS campaign_window_start,
    (CURRENT_DATE - INTERVAL '60 days')::timestamptz AS event_window_start,
    (CURRENT_DATE + INTERVAL '21 days')::timestamptz AS event_window_end
),
recent_events AS (
  SELECT
    e.id,
    e.eid,
    e.name,
    e.event_start_datetime
  FROM public.events e
  CROSS JOIN settings s
  WHERE e.event_start_datetime >= s.event_window_start
    AND e.event_start_datetime < s.event_window_end
    AND (e.enabled IS NULL OR e.enabled = true)
),
campaign_flags AS (
  SELECT
    c.event_id,
    BOOL_OR(lower(c.name) LIKE '%broad%') AS has_broad,
    BOOL_OR(lower(c.name) LIKE '%vip%' AND lower(c.name) NOT LIKE '%no vip%') AS has_vip
  FROM public.sms_marketing_campaigns c
  CROSS JOIN settings s
  WHERE c.created_at >= s.campaign_window_start
  GROUP BY c.event_id
)
SELECT
  re.event_start_datetime::date AS event_date,
  re.eid,
  re.name
FROM recent_events re
JOIN campaign_flags cf ON cf.event_id = re.id
WHERE cf.has_broad
  AND NOT cf.has_vip
ORDER BY re.event_start_datetime;
