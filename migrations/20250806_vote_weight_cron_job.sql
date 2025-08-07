-- Daily refresh job for vote weights materialized view
-- Requires pg_cron extension

-- Enable pg_cron extension if not already enabled
-- Note: This needs to be run as superuser
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily refresh at 3 AM UTC
-- This needs to be run after pg_cron is installed
SELECT cron.schedule(
  'refresh-vote-weights-daily',  -- job name
  '0 3 * * *',                   -- cron expression: daily at 3 AM UTC
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY person_vote_weights;$$
);

-- View scheduled jobs
-- SELECT * FROM cron.job;

-- To unschedule if needed:
-- SELECT cron.unschedule('refresh-vote-weights-daily');

-- Alternative: Create a function that can be called manually or via other scheduling systems
CREATE OR REPLACE FUNCTION manual_refresh_vote_weights()
RETURNS TEXT AS $$
DECLARE
  start_time TIMESTAMP;
  end_time TIMESTAMP;
  row_count INT;
BEGIN
  start_time := clock_timestamp();
  
  -- Refresh the materialized view
  REFRESH MATERIALIZED VIEW CONCURRENTLY person_vote_weights;
  
  end_time := clock_timestamp();
  
  -- Get row count
  SELECT COUNT(*) INTO row_count FROM person_vote_weights;
  
  -- Log the refresh
  INSERT INTO system_logs (
    log_type,
    log_message,
    metadata,
    created_at
  ) SELECT
    'vote_weights_refresh',
    format('Vote weights refreshed: %s rows in %s', row_count, (end_time - start_time)),
    jsonb_build_object(
      'start_time', start_time,
      'end_time', end_time,
      'duration', (end_time - start_time)::TEXT,
      'row_count', row_count
    ),
    NOW()
  WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_logs');
  
  RETURN format('Vote weights refreshed successfully: %s rows in %s', row_count, (end_time - start_time));
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION manual_refresh_vote_weights() TO authenticated;

-- Create initial system_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS system_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_type VARCHAR(100) NOT NULL,
  log_message TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_system_logs_type_created ON system_logs(log_type, created_at DESC);

-- Note for deployment:
-- After running this migration, you need to:
-- 1. Ensure pg_cron is installed on your Supabase instance
-- 2. Run the cron.schedule command to set up the daily job
-- 3. Or use Supabase's built-in cron functionality in the dashboard