-- Fix Slack cron job to handle channel lookups properly
-- This prevents notifications from getting stuck in pending_lookup status

-- Update the existing cron job to use the batch processor that handles lookups
UPDATE cron.job 
SET command = 'SELECT process_slack_queue_batch(10);'
WHERE jobname = 'process-slack-queue-safe';

-- Also add a comment explaining what this job does
COMMENT ON TABLE cron.job IS 'process-slack-queue-safe job updated to use process_slack_queue_batch which handles both channel lookups and message processing';