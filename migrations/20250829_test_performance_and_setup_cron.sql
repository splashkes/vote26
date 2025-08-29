-- Test performance improvements and setup background processing

-- Create a test function to benchmark the old vs new approach
CREATE OR REPLACE FUNCTION test_slack_performance()
RETURNS TABLE(
  test_name TEXT,
  execution_time_ms NUMERIC,
  result TEXT
) AS $$
DECLARE
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_result VARCHAR;
  v_test_event_id UUID;
BEGIN
  -- Get a real event ID for testing
  SELECT id INTO v_test_event_id FROM events LIMIT 1;
  
  IF v_test_event_id IS NULL THEN
    RETURN QUERY SELECT 
      'No events found - skipping queue tests'::TEXT,
      0::NUMERIC,
      'Cannot test without event'::TEXT;
  ELSE
    -- Test 1: Cache-only lookup (should be fast)
    v_start_time := clock_timestamp();
    
    SELECT queue_notification_with_cache_only(
      v_test_event_id,
      'general',
      'performance_test',
      jsonb_build_object('test', 'cache_lookup', 'timestamp', NOW())
    )::TEXT INTO v_result;
    
    v_end_time := clock_timestamp();
    
    RETURN QUERY SELECT 
      'Cache-only notification queue'::TEXT,
      EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time))::NUMERIC,
      'Notification ID: ' || v_result;
  END IF;
    
  -- Test 2: Direct cache lookup
  v_start_time := clock_timestamp();
  
  PERFORM get_cached_slack_channel('general');
  PERFORM get_cached_slack_channel('nonexistent-channel');
  
  v_end_time := clock_timestamp();
  
  RETURN QUERY SELECT 
    'Direct cache lookups (2 calls)'::TEXT,
    EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time))::NUMERIC,
    'Cache hits and misses'::TEXT;
    
  -- Test 3: Multiple queue operations (only if we have an event)
  IF v_test_event_id IS NOT NULL THEN
    v_start_time := clock_timestamp();
    
    FOR i IN 1..10 LOOP
      PERFORM queue_notification_with_cache_only(
        v_test_event_id,
        'general',
        'performance_test_batch',
        jsonb_build_object('test', 'batch_' || i, 'timestamp', NOW())
      );
    END LOOP;
    
    v_end_time := clock_timestamp();
    
    RETURN QUERY SELECT 
      'Batch queue operations (10 calls)'::TEXT,
      EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time))::NUMERIC,
      'All operations completed'::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create a function to populate cache with common channels
CREATE OR REPLACE FUNCTION populate_common_slack_channels()
RETURNS VOID AS $$
BEGIN
  -- Insert common channels with 24-hour TTL
  PERFORM update_slack_channel_cache('general', 'C0337E73W', 24);
  PERFORM update_slack_channel_cache('from-artb', 'C08QG87U3D0', 24);
  PERFORM update_slack_channel_cache('art-battle-notifications', 'C08QG87U3D0', 24);
  
  -- Add some city channels that might be commonly used
  PERFORM update_slack_channel_cache('toronto', 'C1234567890', 24);  -- Example IDs
  PERFORM update_slack_channel_cache('vancouver', 'C2234567890', 24);
  PERFORM update_slack_channel_cache('calgary', 'C3234567890', 24);
  PERFORM update_slack_channel_cache('montreal', 'C4234567890', 24);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Setup scheduled job for processing channel lookups
-- This will run every 30 seconds to process pending_lookup notifications
DO $$
BEGIN
  -- Remove any existing job first
  PERFORM cron.unschedule('process_slack_channel_lookups');
EXCEPTION
  WHEN OTHERS THEN NULL; -- Job might not exist
END
$$;

-- Schedule the background processor
SELECT cron.schedule(
  'process_slack_channel_lookups',
  '*/30 * * * * *',  -- Every 30 seconds
  'SELECT process_slack_channel_lookups(20);'  -- Process up to 20 notifications at a time
);

-- Create monitoring function to check queue health
CREATE OR REPLACE FUNCTION slack_queue_health_check()
RETURNS TABLE(
  metric TEXT,
  count BIGINT,
  oldest_pending TIMESTAMPTZ,
  health_status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    'Total pending notifications'::TEXT,
    COUNT(*),
    MIN(sn.created_at),
    CASE WHEN COUNT(*) > 100 THEN 'WARNING' ELSE 'OK' END
  FROM slack_notifications sn 
  WHERE sn.status = 'pending';
  
  RETURN QUERY
  SELECT 
    'Notifications needing lookup'::TEXT,
    COUNT(*),
    MIN(sn.created_at),
    CASE WHEN COUNT(*) > 50 THEN 'WARNING' ELSE 'OK' END
  FROM slack_notifications sn 
  WHERE sn.status = 'pending_lookup';
  
  RETURN QUERY
  SELECT 
    'Failed notifications'::TEXT,
    COUNT(*),
    MIN(sn.created_at),
    CASE WHEN COUNT(*) > 10 THEN 'ERROR' ELSE 'OK' END
  FROM slack_notifications sn 
  WHERE sn.status = 'failed';
  
  RETURN QUERY
  SELECT 
    'Cached channels (active)'::TEXT,
    COUNT(*),
    MIN(sc.cache_expires_at),
    CASE WHEN COUNT(*) = 0 THEN 'WARNING' ELSE 'OK' END
  FROM slack_channels sc 
  WHERE sc.active = true AND sc.cache_expires_at > NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Populate initial cache
SELECT populate_common_slack_channels();

-- Run performance test
SELECT * FROM test_slack_performance();

-- Check initial queue health
SELECT * FROM slack_queue_health_check();

-- Grant permissions
GRANT EXECUTE ON FUNCTION test_slack_performance() TO authenticated;
GRANT EXECUTE ON FUNCTION populate_common_slack_channels() TO authenticated;
GRANT EXECUTE ON FUNCTION slack_queue_health_check() TO authenticated;

-- Create a simple view to monitor queue status
CREATE OR REPLACE VIEW v_slack_queue_summary AS
SELECT 
  status,
  COUNT(*) as count,
  MIN(created_at) as oldest_created,
  MAX(created_at) as newest_created
FROM slack_notifications 
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY status
ORDER BY count DESC;

GRANT SELECT ON v_slack_queue_summary TO authenticated;