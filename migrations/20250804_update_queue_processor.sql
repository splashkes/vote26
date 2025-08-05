-- Update queue processor to work with Edge Functions
-- This replaces the HTTP-based approach with a simpler queue-based approach

-- Drop the old HTTP-based processor
DROP FUNCTION IF EXISTS process_slack_notification(UUID);

-- Create new processor that prepares messages for Edge Function
CREATE OR REPLACE FUNCTION process_slack_notification(p_notification_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_notification RECORD;
  v_formatted_message JSONB;
BEGIN
  -- Get and lock the notification
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
  
  -- Update notification with formatted blocks
  UPDATE slack_notifications
  SET 
    payload = payload || jsonb_build_object(
      'formatted_blocks', v_formatted_message,
      'formatted_text', COALESCE(v_notification.payload->>'message', 'Art Battle Notification')
    ),
    last_attempt_at = NOW(),
    attempts = attempts + 1
  WHERE id = p_notification_id;
  
  -- The actual sending will be done by calling the Edge Function
  -- This just prepares the message
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Create a function to send notifications via Edge Function
CREATE OR REPLACE FUNCTION send_slack_notification_batch()
RETURNS JSONB AS $$
DECLARE
  v_notifications JSONB;
  v_count INT := 0;
BEGIN
  -- Get pending notifications with formatted messages
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'channel', channel_id,
      'text', payload->>'formatted_text',
      'blocks', payload->'formatted_blocks'
    )
  ) INTO v_notifications
  FROM slack_notifications
  WHERE status = 'pending'
    AND attempts < 3
    AND payload ? 'formatted_blocks'
    AND (last_attempt_at IS NULL OR last_attempt_at < NOW() - INTERVAL '1 minute')
  LIMIT 10;
  
  IF v_notifications IS NOT NULL THEN
    v_count := jsonb_array_length(v_notifications);
  END IF;
  
  RETURN jsonb_build_object(
    'notifications', v_notifications,
    'count', v_count
  );
END;
$$ LANGUAGE plpgsql;

-- Function to mark notifications as sent
CREATE OR REPLACE FUNCTION mark_notifications_sent(p_notification_ids UUID[])
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE slack_notifications
  SET 
    status = 'sent',
    sent_at = NOW()
  WHERE id = ANY(p_notification_ids)
    AND status = 'pending';
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Function to mark notification as failed
CREATE OR REPLACE FUNCTION mark_notification_failed(p_notification_id UUID, p_error TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE slack_notifications
  SET 
    status = CASE 
      WHEN attempts >= 3 THEN 'failed'
      ELSE 'pending'
    END,
    error = p_error
  WHERE id = p_notification_id;
END;
$$ LANGUAGE plpgsql;

-- Updated manual processor that formats messages
CREATE OR REPLACE FUNCTION manual_process_slack_queue()
RETURNS JSONB AS $$
DECLARE
  v_notification RECORD;
  v_processed INT := 0;
  v_formatted INT := 0;
BEGIN
  -- Process notifications to add formatted blocks
  FOR v_notification IN
    SELECT id
    FROM slack_notifications
    WHERE status = 'pending'
      AND NOT (payload ? 'formatted_blocks')
    LIMIT 20
  LOOP
    IF process_slack_notification(v_notification.id) THEN
      v_formatted := v_formatted + 1;
    END IF;
    v_processed := v_processed + 1;
  END LOOP;
  
  -- Get batch of formatted notifications ready to send
  RETURN jsonb_build_object(
    'processed', v_processed,
    'formatted', v_formatted,
    'ready_to_send', send_slack_notification_batch(),
    'timestamp', NOW()
  );
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION send_slack_notification_batch() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION mark_notifications_sent(UUID[]) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION mark_notification_failed(UUID, TEXT) TO authenticated, anon;