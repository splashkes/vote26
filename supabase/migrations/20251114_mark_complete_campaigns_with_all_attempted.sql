-- Mark campaigns as completed if they've attempted all recipients (sent + failed = total)
-- This fixes campaigns stuck in "in_progress" where some messages failed

UPDATE sms_marketing_campaigns
SET
  status = 'completed',
  completed_at = COALESCE(completed_at, NOW())
WHERE
  status = 'in_progress'
  AND total_recipients > 0
  AND (messages_sent + COALESCE(messages_failed, 0)) >= total_recipients;

-- Show the campaigns that were updated
SELECT
  id,
  name,
  status,
  messages_sent,
  messages_failed,
  total_recipients,
  (messages_sent + COALESCE(messages_failed, 0)) as total_attempted
FROM sms_marketing_campaigns
WHERE
  status = 'completed'
  AND (messages_sent + COALESCE(messages_failed, 0)) >= total_recipients
ORDER BY completed_at DESC
LIMIT 10;
