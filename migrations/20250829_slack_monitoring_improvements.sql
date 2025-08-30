-- Add monitoring and safety improvements for Slack queue

-- Create a function to detect and prevent spam scenarios
CREATE OR REPLACE FUNCTION detect_slack_spam()
RETURNS TABLE(
  alert_type TEXT,
  count BIGINT,
  description TEXT
) AS $$
BEGIN
  -- Check for too many pending notifications
  RETURN QUERY
  SELECT 
    'HIGH_PENDING_VOLUME'::TEXT,
    COUNT(*),
    'Too many pending notifications - possible spam'::TEXT
  FROM slack_notifications
  WHERE status = 'pending' 
    AND created_at >= NOW() - INTERVAL '10 minutes'
  HAVING COUNT(*) > 20;
  
  -- Check for generic "Art Battle Notification" messages
  RETURN QUERY
  SELECT 
    'GENERIC_MESSAGE_SPAM'::TEXT,
    COUNT(*),
    'Generic fallback messages being sent - investigate payload issues'::TEXT
  FROM slack_notifications
  WHERE payload->>'text' = 'Art Battle Notification'
    AND created_at >= NOW() - INTERVAL '10 minutes'
  HAVING COUNT(*) > 5;
  
  -- Check for too many test messages
  RETURN QUERY
  SELECT 
    'TEST_MESSAGE_LEAKAGE'::TEXT,
    COUNT(*),
    'Test messages in production queue - clean up needed'::TEXT
  FROM slack_notifications
  WHERE (message_type LIKE '%test%' OR payload->>'test_run' = 'true')
    AND status IN ('pending', 'pending_lookup')
  HAVING COUNT(*) > 0;
  
  -- Check for repeated failures
  RETURN QUERY
  SELECT 
    'REPEATED_FAILURES'::TEXT,
    COUNT(*),
    'Many notifications failing repeatedly - check Slack integration'::TEXT
  FROM slack_notifications
  WHERE status = 'failed'
    AND attempts >= 3
    AND created_at >= NOW() - INTERVAL '1 hour'
  HAVING COUNT(*) > 10;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to clean up test messages safely
CREATE OR REPLACE FUNCTION cleanup_test_notifications()
RETURNS INTEGER AS $$
DECLARE
  v_cleaned INTEGER;
BEGIN
  -- Mark test messages as sent to prevent spam
  WITH cleaned AS (
    UPDATE slack_notifications
    SET status = 'sent',
        sent_at = NOW(),
        error = 'Auto-cleaned: test message'
    WHERE (message_type LIKE '%test%' 
           OR payload->>'test_run' = 'true' 
           OR payload->>'test' IS NOT NULL
           OR (payload->>'text' IS NULL AND message_type IN ('bulk_profile_test', 'performance_test'))
          )
      AND status IN ('pending', 'pending_lookup', 'failed')
    RETURNING id
  )
  SELECT COUNT(*) INTO v_cleaned FROM cleaned;
  
  RETURN v_cleaned;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a safer queue processing function that avoids spam
CREATE OR REPLACE FUNCTION process_slack_queue_safe(p_batch_size INTEGER DEFAULT 5)
RETURNS TABLE(processed INTEGER, succeeded INTEGER, failed INTEGER, cleaned INTEGER) AS $$
DECLARE
  v_notification_id UUID;
  v_processed INT := 0;
  v_succeeded INT := 0;
  v_failed INT := 0;
  v_cleaned INT := 0;
  v_result BOOLEAN;
BEGIN
  -- First, clean up any test messages
  SELECT cleanup_test_notifications() INTO v_cleaned;
  
  -- Check for spam conditions
  IF EXISTS (
    SELECT 1 FROM slack_notifications 
    WHERE status = 'pending' 
      AND created_at >= NOW() - INTERVAL '5 minutes'
    HAVING COUNT(*) > 50
  ) THEN
    -- Too many pending - don't process to avoid spam
    RETURN QUERY SELECT 0, 0, 0, v_cleaned;
    RETURN;
  END IF;
  
  -- Process only real notifications
  FOR v_notification_id IN
    SELECT id
    FROM slack_notifications
    WHERE status = 'pending'
      AND attempts < 3
      AND message_type NOT LIKE '%test%'
      AND payload->>'test_run' IS DISTINCT FROM 'true'
      AND payload->>'text' IS NOT NULL
      AND TRIM(payload->>'text') != ''
    ORDER BY created_at
    LIMIT p_batch_size
  LOOP
    v_processed := v_processed + 1;
    v_result := process_slack_notification(v_notification_id);
    
    IF v_result THEN
      v_succeeded := v_succeeded + 1;
    ELSE
      v_failed := v_failed + 1;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT v_processed, v_succeeded, v_failed, v_cleaned;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the cron job to use the safer function
SELECT cron.unschedule('process-slack-queue-production-only');

SELECT cron.schedule(
  'process-slack-queue-safe',
  '*/3 * * * *',  -- Every 3 minutes 
  'SELECT process_slack_queue_safe(3);'  -- Small batches only
);

-- Schedule spam detection
SELECT cron.schedule(
  'slack-spam-detection',
  '*/15 * * * *',  -- Every 15 minutes
  'SELECT detect_slack_spam();'
);

-- Grant permissions
GRANT EXECUTE ON FUNCTION detect_slack_spam() TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_test_notifications() TO authenticated;
GRANT EXECUTE ON FUNCTION process_slack_queue_safe(INTEGER) TO authenticated;

-- Run initial cleanup
SELECT cleanup_test_notifications();