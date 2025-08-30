-- Fix Slack queue processor to prevent spam and handle empty messages properly

-- First, let's improve the message handling in process_slack_notification
CREATE OR REPLACE FUNCTION process_slack_notification(p_notification_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_notification RECORD;
  v_channel_name TEXT;
  v_response RECORD;
  v_success BOOLEAN := FALSE;
  v_slack_payload TEXT;
  v_slack_token TEXT;
  v_message_text TEXT;
BEGIN
  -- Get Slack token from vault
  SELECT decrypted_secret INTO v_slack_token
  FROM vault.decrypted_secrets
  WHERE name = 'slack_token';

  IF v_slack_token IS NULL THEN
    UPDATE slack_notifications
    SET status = 'failed',
        error = 'Slack token not found in vault'
    WHERE id = p_notification_id;
    RETURN FALSE;
  END IF;

  -- Get and lock the notification
  SELECT * INTO v_notification
  FROM slack_notifications
  WHERE id = p_notification_id
  FOR UPDATE;

  IF v_notification IS NULL OR v_notification.status NOT IN ('pending', 'pending_lookup') THEN
    RETURN FALSE;
  END IF;

  -- Skip test messages to prevent spam
  IF v_notification.message_type LIKE '%test%' 
     OR v_notification.payload->>'test_run' = 'true' 
     OR v_notification.payload->>'test' IS NOT NULL THEN
    UPDATE slack_notifications
    SET status = 'sent', 
        sent_at = NOW(),
        error = 'Skipped - test message'
    WHERE id = p_notification_id;
    RETURN TRUE; -- Return success so it doesn't retry
  END IF;

  -- Update attempt count
  UPDATE slack_notifications
  SET attempts = attempts + 1, last_attempt_at = NOW()
  WHERE id = p_notification_id;

  BEGIN
    -- Handle null channel_id case
    IF v_notification.channel_id IS NULL THEN
      UPDATE slack_notifications
      SET status = 'failed',
          error = 'No channel_id specified - cannot deliver message'
      WHERE id = p_notification_id;
      RETURN FALSE;
    END IF;

    -- Get message text with better fallback handling
    v_message_text := v_notification.payload->>'text';
    
    -- If message is empty or null, skip it to prevent spam
    IF v_message_text IS NULL OR TRIM(v_message_text) = '' THEN
      UPDATE slack_notifications
      SET status = 'sent',
          sent_at = NOW(),
          error = 'Skipped - empty message content'
      WHERE id = p_notification_id;
      RETURN TRUE;
    END IF;

    -- Get channel name from payload or use channel_id
    v_channel_name := v_notification.payload->>'channel_name';
    IF v_channel_name IS NULL THEN
      v_channel_name := v_notification.channel_id;
    END IF;

    -- Prepare Slack API payload with blocks if available
    IF v_notification.payload ? 'blocks' THEN
      -- Use blocks for rich formatting
      v_slack_payload := json_build_object(
        'channel', v_notification.channel_id,
        'blocks', v_notification.payload->'blocks',
        'text', v_message_text,
        'unfurl_links', false,
        'unfurl_media', false
      )::text;
    ELSE
      -- Use plain text
      v_slack_payload := json_build_object(
        'channel', v_notification.channel_id,
        'text', v_message_text,
        'unfurl_links', false,
        'unfurl_media', false
      )::text;
    END IF;

    -- Call Slack API
    SELECT * INTO v_response
    FROM http((
      'POST',
      'https://slack.com/api/chat.postMessage',
      ARRAY[http_header('authorization', 'Bearer ' || v_slack_token)],
      'application/json',
      v_slack_payload
    )::http_request);

    -- Check response
    IF v_response.status >= 200 AND v_response.status < 300 THEN
      DECLARE
        v_slack_response JSONB;
      BEGIN
        v_slack_response := v_response.content::jsonb;
        IF v_slack_response->>'ok' = 'true' THEN
          UPDATE slack_notifications
          SET status = 'sent', sent_at = NOW()
          WHERE id = p_notification_id;
          v_success := TRUE;
        ELSE
          UPDATE slack_notifications
          SET status = 'failed',
              error = 'Slack API error: ' || COALESCE(v_slack_response->>'error', 'Unknown Slack error')
          WHERE id = p_notification_id;
          v_success := FALSE;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- JSON parsing failed, treat as success if HTTP was 200
        UPDATE slack_notifications
        SET status = 'sent', sent_at = NOW()
        WHERE id = p_notification_id;
        v_success := TRUE;
      END;
    ELSE
      UPDATE slack_notifications
      SET status = 'failed',
          error = 'Slack API HTTP ' || v_response.status || ': ' || COALESCE(v_response.content, 'Unknown error')
      WHERE id = p_notification_id;
      v_success := FALSE;
    END IF;

  EXCEPTION
    WHEN OTHERS THEN
      UPDATE slack_notifications
      SET status = 'failed', error = 'Exception: ' || SQLERRM
      WHERE id = p_notification_id;
      v_success := FALSE;
  END;

  RETURN v_success;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clean up any existing test notifications that might be causing issues
UPDATE slack_notifications 
SET status = 'sent', 
    sent_at = NOW(),
    error = 'Cleaned up - test message'
WHERE message_type LIKE '%test%' 
  OR payload->>'test_run' = 'true' 
  OR payload->>'test' IS NOT NULL
  AND status IN ('pending', 'pending_lookup', 'failed');

-- Create a safer cron job that only processes real notifications
SELECT cron.schedule(
  'process-slack-queue-production-only',
  '*/2 * * * *',  -- Every 2 minutes instead of every minute
  'SELECT process_slack_queue(5);'  -- Process smaller batches
);

-- Grant permissions
GRANT EXECUTE ON FUNCTION process_slack_notification(UUID) TO authenticated;