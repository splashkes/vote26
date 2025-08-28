-- Setup Auth Monitor Cron Job
-- Creates a cron job that runs every 5 minutes to monitor auth activity

-- Remove any existing cron job with the same name first
SELECT cron.unschedule('auth-monitor-5min') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'auth-monitor-5min'
);

-- Create the cron job to call our auth monitor function every 5 minutes
-- Using pg_net for async HTTP requests (recommended for Supabase)
SELECT cron.schedule(
  'auth-monitor-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/auth-monitor-cron',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := '{"source": "supabase_cron"}'::jsonb
  );
  $$
);

-- Create a function to check the status of our cron job
CREATE OR REPLACE FUNCTION check_auth_monitor_cron_status()
RETURNS TABLE(
  jobname text,
  schedule text,
  command text,
  active boolean,
  last_run timestamptz,
  next_run timestamptz
) 
LANGUAGE sql
AS $$
  SELECT 
    j.jobname::text,
    j.schedule::text,
    j.command::text,
    j.active,
    j.last_run,
    j.next_run
  FROM cron.job j 
  WHERE j.jobname = 'auth-monitor-5min';
$$;

-- Verify the cron job was created
SELECT * FROM check_auth_monitor_cron_status();