-- Set up automated Slack queue processing using Supabase pg_cron
-- This will process 20 notifications every minute

-- Enable the pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a scheduled job to process the Slack queue every minute
-- This runs directly in the database with proper permissions
SELECT cron.schedule(
    'process-slack-queue-every-minute',
    '* * * * *', -- Every minute
    'SELECT process_slack_queue_batch(20);'
);

-- Create a scheduled job to clean up old notifications weekly
-- This runs every Sunday at 2 AM to clean up notifications older than 7 days
SELECT cron.schedule(
    'cleanup-old-slack-notifications',
    '0 2 * * 0', -- Every Sunday at 2 AM
    'SELECT cleanup_old_slack_notifications(7);'
);

-- Create a monitoring function to log queue processing status
CREATE OR REPLACE FUNCTION log_queue_status()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_status JSONB;
BEGIN
    SELECT get_detailed_slack_queue_status() INTO v_status;
    
    -- Log if there are many pending notifications (> 50)
    IF (v_status->>'pending')::integer > 50 THEN
        RAISE NOTICE 'Slack Queue Alert: % pending notifications, % failed in last hour', 
            v_status->>'pending', 
            v_status->>'last_hour_failed';
    END IF;
END;
$$;

-- Optional: Add a monitoring job every 5 minutes to log alerts
SELECT cron.schedule(
    'monitor-slack-queue',
    '*/5 * * * *', -- Every 5 minutes
    'SELECT log_queue_status();'
);

-- Display current cron jobs
SELECT jobname, schedule, command 
FROM cron.job 
WHERE jobname LIKE '%slack%' 
ORDER BY jobname;