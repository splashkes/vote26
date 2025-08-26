-- Fix process_slack_notification to properly handle null channel_id cases
CREATE OR REPLACE FUNCTION process_slack_notification(p_notification_id uuid)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_notification RECORD;
  v_channel_name TEXT;
  v_response RECORD;
  v_success BOOLEAN := FALSE;
  v_slack_payload TEXT;
  v_slack_token TEXT;
BEGIN
  -- Get Slack token from vault instead of hardcoded
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

  -- Update attempt count
  UPDATE slack_notifications
  SET attempts = attempts + 1, last_attempt_at = NOW()
  WHERE id = p_notification_id;

  BEGIN
    -- Handle null channel_id case - mark as failed immediately
    IF v_notification.channel_id IS NULL THEN
      UPDATE slack_notifications
      SET status = 'failed',
          error = 'No channel_id specified - cannot deliver message'
      WHERE id = p_notification_id;
      RETURN FALSE;
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
        'channel', v_notification.channel_id, -- Use channel_id directly
        'blocks', v_notification.payload->'blocks',
        'text', v_notification.payload->>'text',  -- Fallback text
        'unfurl_links', false,
        'unfurl_media', false
      )::text;
    ELSE
      -- Fallback to plain text
      v_slack_payload := json_build_object(
        'channel', v_notification.channel_id, -- Use channel_id directly
        'text', COALESCE(v_notification.payload->>'text', 'Art Battle Notification'),
        'unfurl_links', false,
        'unfurl_media', false
      )::text;
    END IF;

    -- Call Slack API directly to post message
    SELECT * INTO v_response
    FROM http((
      'POST',
      'https://slack.com/api/chat.postMessage',
      ARRAY[http_header('authorization', 'Bearer ' || v_slack_token)],
      'application/json',
      v_slack_payload
    )::http_request);

    -- Check if the response indicates success (status 2xx)
    IF v_response.status >= 200 AND v_response.status < 300 THEN
      -- Also check Slack API response for "ok": true
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
$$;

-- Mark all existing notifications with null channel_id as failed
UPDATE slack_notifications 
SET status = 'failed', 
    error = 'Legacy notification with null channel_id - cannot deliver',
    last_attempt_at = NOW()
WHERE status = 'pending' 
AND channel_id IS NULL;