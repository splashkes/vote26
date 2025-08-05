-- Final fix for Slack formatting - properly handle text in blocks

-- Update the notification processor to ensure proper text formatting
CREATE OR REPLACE FUNCTION process_slack_notification(p_notification_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_notification RECORD;
  v_formatted_message JSONB;
  v_formatted_text TEXT;
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
  
  -- Get the text version (without double escaping)
  v_formatted_text := COALESCE(v_notification.payload->>'message', 'Art Battle Notification');
  
  -- Update notification with formatted blocks
  UPDATE slack_notifications
  SET 
    payload = payload || jsonb_build_object(
      'formatted_blocks', v_formatted_message,
      'formatted_text', v_formatted_text
    ),
    last_attempt_at = NOW(),
    attempts = attempts + 1
  WHERE id = p_notification_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Test by sending a simple formatted message
DO $$
DECLARE
  v_channel_id VARCHAR;
BEGIN
  -- Get channel for test event
  SELECT channel_id INTO v_channel_id
  FROM event_slack_settings
  WHERE event_id = (SELECT id FROM events WHERE eid = 'TEST123');
  
  -- Queue a test notification with rich formatting
  INSERT INTO slack_notifications (
    event_id,
    channel_id,
    message_type,
    payload
  ) VALUES (
    (SELECT id FROM events WHERE eid = 'TEST123'),
    v_channel_id,
    'test',
    jsonb_build_object(
      'message', E'🎨 *Art Battle Notification System*\n\nAll systems operational! The following notifications are enabled:\n\n:ballot_box_with_ballot: *Voting* - Every 10 votes + milestones\n:moneybag: *Bidding* - Bids over $100\n:checkered_flag: *Rounds* - Completion alerts\n:chart_with_upwards_trend: *Summaries* - Hourly reports\n\n_Ready for AB3032!_',
      'test', true,
      'timestamp', NOW()
    )
  );
  
  RAISE NOTICE 'Test notification queued';
END $$;