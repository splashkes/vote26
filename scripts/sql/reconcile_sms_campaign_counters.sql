-- Reconcile sms_marketing_campaigns counters from authoritative sms_outbound rows.
-- This repairs historical campaigns where messages_sent/messages_failed drifted from
-- the actual outbound logs after retries or partial cron runs.
--
-- Usage:
--   PGPASSWORD=$(cat ~/creds/supabase/db-password) \
--   psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres \
--   -f scripts/sql/reconcile_sms_campaign_counters.sql

WITH outbound_counts AS (
  SELECT
    campaign_id,
    COUNT(*) FILTER (WHERE status = 'sent') AS actual_sent,
    COUNT(*) FILTER (WHERE status = 'failed') AS actual_failed
  FROM public.sms_outbound
  WHERE campaign_id IS NOT NULL
  GROUP BY campaign_id
),
to_fix AS (
  SELECT
    c.id,
    COALESCE(o.actual_sent, 0) AS actual_sent,
    COALESCE(o.actual_failed, 0) AS actual_failed
  FROM public.sms_marketing_campaigns c
  LEFT JOIN outbound_counts o ON o.campaign_id = c.id
  WHERE COALESCE(c.messages_sent, 0) <> COALESCE(o.actual_sent, 0)
     OR COALESCE(c.messages_failed, 0) <> COALESCE(o.actual_failed, 0)
)
UPDATE public.sms_marketing_campaigns c
SET
  messages_sent = f.actual_sent,
  messages_failed = f.actual_failed,
  updated_at = NOW()
FROM to_fix f
WHERE c.id = f.id;

SELECT
  c.id,
  c.name,
  c.messages_sent,
  c.messages_failed
FROM public.sms_marketing_campaigns c
WHERE c.id IN (
  SELECT campaign_id
  FROM public.sms_outbound
  WHERE campaign_id IS NOT NULL
)
ORDER BY c.updated_at DESC
LIMIT 25;
