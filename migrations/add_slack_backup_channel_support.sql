-- Add backup channel support for Slack notifications
-- This migration improves the process_slack_notification function to use fallback channels

CREATE OR REPLACE FUNCTION public.process_slack_notification(p_notification_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_notification RECORD;
  v_channel_name TEXT;
  v_response RECORD;
  v_success BOOLEAN := FALSE;
  v_slack_payload TEXT;
  v_slack_token TEXT;
  v_message_text TEXT;
  v_backup_channel_id TEXT := 'C04PQAK3X'; -- fallback channel as specified
  v_original_channel_id TEXT;
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
    -- Store original channel_id for tracking
    v_original_channel_id := v_notification.channel_id;
    
    -- BACKUP CHANNEL LOGIC - Handle null channel_id case with intelligent fallback
    IF v_notification.channel_id IS NULL OR TRIM(v_notification.channel_id) = '' THEN
      -- Use the specified fallback channel for all messages with missing channel_id
      v_notification.channel_id := v_backup_channel_id; -- C04PQAK3X
      
      -- Log the backup channel usage
      RAISE NOTICE 'Using backup channel % for message type % (original channel was null)', 
                    v_notification.channel_id, v_notification.message_type;
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
        v_update_error TEXT := '';
      BEGIN
        v_slack_response := v_response.content::jsonb;
        IF v_slack_response->>'ok' = 'true' THEN
          -- Include backup channel info in success message
          IF v_original_channel_id IS NULL THEN
            v_update_error := 'Sent to backup channel ' || v_notification.channel_id || ' (original channel was null)';
          END IF;
          
          UPDATE slack_notifications
          SET status = 'sent', 
              sent_at = NOW(),
              error = CASE WHEN v_update_error != '' THEN v_update_error ELSE NULL END
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
$function$;

-- Add a comment documenting the backup channel logic
COMMENT ON FUNCTION process_slack_notification(uuid) IS 
'Processes Slack notifications with backup channel fallback. 
Uses C04PQAK3X as backup channel when original channel_id is null or empty.';