-- Add pg_cron job to process scheduled SMS campaigns every minute
-- This job checks for campaigns with scheduled_at <= NOW() and sends them

-- First unschedule if exists
SELECT cron.unschedule('process-scheduled-sms-campaigns') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'process-scheduled-sms-campaigns'
);

SELECT cron.schedule(
  'process-scheduled-sms-campaigns',
  '* * * * *',  -- Run every minute
  $$
  SELECT net.http_post(
    url := 'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/sms-scheduled-campaigns-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (SELECT secret_value FROM cron_secrets WHERE name = 'sms_scheduled_cron')
    ),
    body := '{"source": "pg_cron"}'::jsonb
  );
  $$
);
