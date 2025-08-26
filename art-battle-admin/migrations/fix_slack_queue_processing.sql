-- Fix the hardcoded token security issue and update queue processing
CREATE OR REPLACE FUNCTION public.process_slack_notification(p_notification_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
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
    RAISE NOTICE 'Slack token not found in vault for notification %', p_notification_id;
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
    -- Get channel name from payload
    v_channel_name := v_notification.payload->>'channel_name';
    IF v_channel_name IS NULL THEN
      v_channel_name := COALESCE(v_notification.channel_id, 'general');
    END IF;

    -- Prepare Slack API payload with blocks if available
    IF v_notification.payload ? 'blocks' THEN
      -- Use blocks for rich formatting
      v_slack_payload := json_build_object(
        'channel', v_channel_name,
        'blocks', v_notification.payload->'blocks',
        'text', v_notification.payload->>'text',  -- Fallback text
        'unfurl_links', false,
        'unfurl_media', false
      )::text;
    ELSE
      -- Fallback to plain text
      v_slack_payload := json_build_object(
        'channel', v_channel_name,
        'text', v_notification.payload->>'text',
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
      UPDATE slack_notifications
      SET status = 'sent', sent_at = NOW()
      WHERE id = p_notification_id;
      v_success := TRUE;
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

-- Create a function to process multiple pending notifications
CREATE OR REPLACE FUNCTION process_pending_slack_notifications(batch_size INTEGER DEFAULT 10)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_notification RECORD;
    v_processed INTEGER := 0;
    v_succeeded INTEGER := 0;
    v_failed INTEGER := 0;
    v_result BOOLEAN;
BEGIN
    -- Process pending notifications in batches
    FOR v_notification IN 
        SELECT id 
        FROM slack_notifications 
        WHERE status = 'pending' 
        ORDER BY created_at ASC 
        LIMIT batch_size
    LOOP
        SELECT process_slack_notification(v_notification.id) INTO v_result;
        
        v_processed := v_processed + 1;
        IF v_result THEN
            v_succeeded := v_succeeded + 1;
        ELSE
            v_failed := v_failed + 1;
        END IF;
    END LOOP;
    
    RETURN jsonb_build_object(
        'processed', v_processed,
        'succeeded', v_succeeded,
        'failed', v_failed,
        'timestamp', now()
    );
END;
$$;