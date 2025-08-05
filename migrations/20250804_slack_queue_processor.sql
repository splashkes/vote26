-- Slack Notification Queue Processor
-- This migration adds the queue processing functionality

-- 1. Function to store secrets (run these manually in Supabase SQL editor)
-- INSERT INTO vault.secrets (name, secret) VALUES 
-- ('SLACK_BOT_TOKEN', 'REDACTED_SLACK_BOT_TOKEN'),
-- ('SLACK_SIGNING_SECRET', 'REDACTED_SLACK_SIGNING_SECRET'),
-- ('SLACK_APP_TOKEN', 'REDACTED_SLACK_APP_TOKEN');

-- 2. Function to get secrets from vault
CREATE OR REPLACE FUNCTION get_secret(secret_name text)
RETURNS text AS $$
DECLARE
  secret_value text;
BEGIN
  SELECT decrypted_secret INTO secret_value
  FROM vault.decrypted_secrets
  WHERE name = secret_name;
  
  RETURN secret_value;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Enable HTTP extension for making requests
CREATE EXTENSION IF NOT EXISTS http;

-- 4. Process single notification
CREATE OR REPLACE FUNCTION process_slack_notification(p_notification_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_notification RECORD;
  v_formatted_message JSONB;
  v_edge_function_url TEXT;
  v_response http_response;
  v_request_headers http_header[];
  v_request_body TEXT;
  v_service_key TEXT;
BEGIN
  -- Get the notification
  SELECT * INTO v_notification
  FROM slack_notifications
  WHERE id = p_notification_id
  FOR UPDATE;
  
  IF v_notification IS NULL OR v_notification.status != 'pending' THEN
    RETURN FALSE;
  END IF;
  
  -- Format the message
  v_formatted_message := format_slack_message(
    v_notification.message_type, 
    v_notification.payload
  );
  
  -- Get Edge Function URL
  v_edge_function_url := current_setting('app.supabase_url') || '/functions/v1/slack-webhook';
  
  -- Get service role key
  v_service_key := current_setting('app.service_role_key', true);
  
  IF v_service_key IS NULL THEN
    -- Update with error
    UPDATE slack_notifications
    SET 
      status = 'failed',
      error = 'Service role key not configured',
      attempts = attempts + 1,
      last_attempt_at = NOW()
    WHERE id = p_notification_id;
    RETURN FALSE;
  END IF;
  
  -- Prepare request
  v_request_headers := ARRAY[
    http_header('Authorization', 'Bearer ' || v_service_key),
    http_header('Content-Type', 'application/json')
  ];
  
  v_request_body := jsonb_build_object(
    'channel', v_notification.channel_id,
    'text', COALESCE(v_notification.payload->>'message', 'Art Battle Notification'),
    'blocks', v_formatted_message
  )::text;
  
  BEGIN
    -- Make HTTP request to Edge Function
    v_response := http_post(
      v_edge_function_url,
      v_request_body,
      'application/json',
      v_request_headers
    );
    
    -- Check response
    IF v_response.status = 200 THEN
      -- Success
      UPDATE slack_notifications
      SET 
        status = 'sent',
        sent_at = NOW(),
        attempts = attempts + 1,
        last_attempt_at = NOW()
      WHERE id = p_notification_id;
      
      RETURN TRUE;
    ELSE
      -- Failed
      UPDATE slack_notifications
      SET 
        status = CASE 
          WHEN attempts >= 2 THEN 'failed'
          ELSE 'pending'
        END,
        error = 'HTTP ' || v_response.status || ': ' || v_response.content,
        attempts = attempts + 1,
        last_attempt_at = NOW()
      WHERE id = p_notification_id;
      
      RETURN FALSE;
    END IF;
    
  EXCEPTION WHEN OTHERS THEN
    -- Error occurred
    UPDATE slack_notifications
    SET 
      status = CASE 
        WHEN attempts >= 2 THEN 'failed'
        ELSE 'pending'
      END,
      error = SQLERRM,
      attempts = attempts + 1,
      last_attempt_at = NOW()
    WHERE id = p_notification_id;
    
    RETURN FALSE;
  END;
END;
$$ LANGUAGE plpgsql;

-- 5. Batch process notifications
CREATE OR REPLACE FUNCTION process_slack_queue(p_batch_size INT DEFAULT 10)
RETURNS TABLE(processed INT, succeeded INT, failed INT) AS $$
DECLARE
  v_notification_id UUID;
  v_processed INT := 0;
  v_succeeded INT := 0;
  v_failed INT := 0;
  v_result BOOLEAN;
BEGIN
  -- Process notifications in batches
  FOR v_notification_id IN
    SELECT id
    FROM slack_notifications
    WHERE status = 'pending'
      AND attempts < 3
      AND (last_attempt_at IS NULL OR last_attempt_at < NOW() - INTERVAL '1 minute' * (attempts + 1))
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
  
  RETURN QUERY SELECT v_processed, v_succeeded, v_failed;
END;
$$ LANGUAGE plpgsql;

-- 6. Alternative approach using Edge Function directly (if HTTP extension not available)
CREATE OR REPLACE FUNCTION process_slack_notification_via_edge(p_notification_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_notification RECORD;
  v_formatted_message JSONB;
BEGIN
  -- Get the notification
  SELECT * INTO v_notification
  FROM slack_notifications
  WHERE id = p_notification_id;
  
  IF v_notification IS NULL OR v_notification.status != 'pending' THEN
    RETURN FALSE;
  END IF;
  
  -- Format the message
  v_formatted_message := format_slack_message(
    v_notification.message_type, 
    v_notification.payload
  );
  
  -- Store formatted message for Edge Function to pick up
  UPDATE slack_notifications
  SET 
    payload = payload || jsonb_build_object(
      'formatted_blocks', v_formatted_message,
      'ready_to_send', true
    ),
    last_attempt_at = NOW()
  WHERE id = p_notification_id;
  
  -- Edge Function will handle the actual sending
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- 7. Manual queue processor (can be called from application or cron)
CREATE OR REPLACE FUNCTION manual_process_slack_queue()
RETURNS JSONB AS $$
DECLARE
  v_result RECORD;
BEGIN
  SELECT * INTO v_result FROM process_slack_queue(20);
  
  RETURN jsonb_build_object(
    'processed', v_result.processed,
    'succeeded', v_result.succeeded,
    'failed', v_result.failed,
    'timestamp', NOW()
  );
END;
$$ LANGUAGE plpgsql;

-- 8. Get queue status
CREATE OR REPLACE FUNCTION get_slack_queue_status()
RETURNS JSONB AS $$
DECLARE
  v_status JSONB;
BEGIN
  SELECT jsonb_build_object(
    'pending', COUNT(*) FILTER (WHERE status = 'pending'),
    'sent', COUNT(*) FILTER (WHERE status = 'sent'),
    'failed', COUNT(*) FILTER (WHERE status = 'failed'),
    'total', COUNT(*),
    'oldest_pending', MIN(created_at) FILTER (WHERE status = 'pending'),
    'newest_pending', MAX(created_at) FILTER (WHERE status = 'pending')
  ) INTO v_status
  FROM slack_notifications;
  
  RETURN v_status;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_secret(text) TO service_role;
GRANT EXECUTE ON FUNCTION process_slack_notification(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION process_slack_queue(INT) TO service_role;
GRANT EXECUTE ON FUNCTION manual_process_slack_queue() TO authenticated;
GRANT EXECUTE ON FUNCTION get_slack_queue_status() TO authenticated;