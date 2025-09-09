-- Add daily cron job to process Slack channel lookups
-- This prevents notifications from getting stuck in pending_lookup status
-- when channel cache expires

-- Create a daily cron job to process channel lookups
-- Runs at 1 AM daily to handle any pending_lookup notifications
SELECT cron.schedule(
    'daily-slack-channel-lookups',
    '0 1 * * *', -- Run at 1 AM every day
    'SELECT process_slack_channel_lookups(100);'
);

-- Also add a weekly cache refresh job to prevent cache expiration issues
-- Runs every Sunday at 3 AM to refresh all channel cache entries
SELECT cron.schedule(
    'weekly-slack-cache-refresh',
    '0 3 * * 0', -- Run at 3 AM every Sunday
    $$
    -- Refresh cache for all active channels with 7-day TTL
    SELECT update_slack_channel_cache(channel_name, channel_id, 168) -- 168 hours = 7 days
    FROM slack_channels 
    WHERE active = true;
    $$
);

-- Add comments to document these jobs
COMMENT ON EXTENSION cron IS 'Cron jobs include: daily-slack-channel-lookups (processes stuck notifications) and weekly-slack-cache-refresh (prevents cache expiration)';