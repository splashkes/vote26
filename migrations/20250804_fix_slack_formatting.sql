-- Fix Slack message formatting for proper newlines and emoji

-- Update the message formatter to handle newlines and emoji properly
CREATE OR REPLACE FUNCTION format_slack_message(
  p_type VARCHAR,
  p_payload JSONB
) RETURNS JSONB AS $$
BEGIN
  CASE p_type
    WHEN 'vote_update' THEN
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', format(E':ballot_box_with_ballot: *New Vote!*\nArtist: %s\nTotal Votes: %s\nRound: %s',
              p_payload->>'artist_name',
              p_payload->>'vote_count',
              p_payload->>'round'
            )
          )
        )
      );
      
    WHEN 'new_bid' THEN
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', format(E':moneybag: %s*New Bid!*\nArtwork: %s by %s\nAmount: $%s',
              CASE WHEN (p_payload->>'is_high_value')::boolean 
                THEN ':fire: ' ELSE '' END,
              p_payload->>'art_code',
              p_payload->>'artist_name',
              to_char((p_payload->>'bid_amount')::numeric, 'FM999,999.00')
            )
          )
        )
      );
      
    WHEN 'round_complete' THEN
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', format(E':checkered_flag: *Round %s Complete!*\nWinner: %s\nVotes: %s',
              p_payload->>'round_number',
              p_payload->>'winner_name',
              p_payload->>'winner_votes'
            )
          )
        )
      );
      
    WHEN 'vote_milestone' THEN
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', format(E':tada: *Voting Milestone!*\n%s votes reached!\nEvent: %s',
              p_payload->>'milestone',
              p_payload->>'event_name'
            )
          )
        )
      );
      
    WHEN 'hourly_summary' THEN
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'header',
          'text', jsonb_build_object(
            'type', 'plain_text',
            'text', 'Hourly Event Summary',
            'emoji', true
          )
        ),
        jsonb_build_object(
          'type', 'section',
          'fields', p_payload->'fields'
        ),
        jsonb_build_object(
          'type', 'divider'
        ),
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', ':trophy: *Current Leaders*'
          )
        ),
        jsonb_build_object(
          'type', 'section',
          'fields', p_payload->'leaders'
        )
      );
      
    WHEN 'event_complete' THEN
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'header',
          'text', jsonb_build_object(
            'type', 'plain_text',
            'text', format('Event Complete: %s', p_payload->>'event_name'),
            'emoji', true
          )
        ),
        jsonb_build_object(
          'type', 'section',
          'fields', jsonb_build_array(
            jsonb_build_object(
              'type', 'mrkdwn',
              'text', format('*Artists:* %s', p_payload->>'total_artists')
            ),
            jsonb_build_object(
              'type', 'mrkdwn',
              'text', format('*Rounds:* %s', p_payload->>'total_rounds')
            ),
            jsonb_build_object(
              'type', 'mrkdwn',
              'text', format('*Voters:* %s', p_payload->>'total_voters')
            ),
            jsonb_build_object(
              'type', 'mrkdwn',
              'text', format('*Total Votes:* %s', p_payload->>'total_votes')
            )
          )
        ),
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', format(E'*Auction Total:* $%s\n*Unique Bidders:* %s',
              to_char(((p_payload->'auction_stats')->>'total_value')::numeric, 'FM999,999.00'),
              (p_payload->'auction_stats')->>'unique_bidders'
            )
          )
        )
      );
      
    ELSE
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', COALESCE(p_payload->>'message', 'Art Battle Notification')
          )
        )
      );
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- Also update the test notification function to not double-escape
CREATE OR REPLACE FUNCTION send_test_slack_notification(
  p_message_type VARCHAR DEFAULT 'test',
  p_message TEXT DEFAULT 'This is a test notification from Art Battle Vote system'
) RETURNS JSONB AS $$
DECLARE
  v_event_id UUID;
  v_channel_id VARCHAR;
  v_notification_id UUID;
BEGIN
  -- Get test event
  SELECT e.id, es.channel_id 
  INTO v_event_id, v_channel_id
  FROM events e
  JOIN event_slack_settings es ON es.event_id = e.id
  WHERE e.eid = 'TEST123';
  
  IF v_channel_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No Slack channel configured for test event'
    );
  END IF;
  
  -- Queue test notification (without double escaping)
  INSERT INTO slack_notifications (
    event_id,
    channel_id,
    message_type,
    payload
  ) VALUES (
    v_event_id,
    v_channel_id,
    p_message_type,
    jsonb_build_object(
      'message', p_message,
      'test', true,
      'timestamp', NOW()
    )
  ) RETURNING id INTO v_notification_id;
  
  -- Process immediately
  PERFORM process_slack_notification(v_notification_id);
  
  -- Return result
  RETURN jsonb_build_object(
    'success', true,
    'notification_id', v_notification_id,
    'channel_id', v_channel_id,
    'message', p_message
  );
END;
$$ LANGUAGE plpgsql;

-- Fix the hourly summary formatting with proper structure
CREATE OR REPLACE FUNCTION format_slack_message(
  p_type VARCHAR,
  p_payload JSONB
) RETURNS JSONB AS $$
BEGIN
  CASE p_type
    WHEN 'vote_update' THEN
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', format(E':ballot_box_with_ballot: *New Vote!*\nArtist: %s\nTotal Votes: %s\nRound: %s',
              p_payload->>'artist_name',
              p_payload->>'vote_count',
              p_payload->>'round'
            )
          )
        )
      );
      
    WHEN 'new_bid' THEN
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', format(E':moneybag: %s*New Bid!*\nArtwork: %s by %s\nAmount: $%s',
              CASE WHEN (p_payload->>'is_high_value')::boolean 
                THEN ':fire: ' ELSE '' END,
              p_payload->>'art_code',
              p_payload->>'artist_name',
              to_char((p_payload->>'bid_amount')::numeric, 'FM999,999.00')
            )
          )
        )
      );
      
    WHEN 'round_complete' THEN
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', format(E':checkered_flag: *Round %s Complete!*\nWinner: %s\nVotes: %s',
              p_payload->>'round_number',
              p_payload->>'winner_name',
              p_payload->>'winner_votes'
            )
          )
        )
      );
      
    WHEN 'vote_milestone' THEN
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', format(E':tada: *Voting Milestone!*\n%s votes reached!\nEvent: %s',
              p_payload->>'milestone',
              p_payload->>'event_name'
            )
          )
        )
      );
      
    WHEN 'hourly_summary' THEN
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'header',
          'text', jsonb_build_object(
            'type', 'plain_text',
            'text', 'Hourly Event Summary',
            'emoji', true
          )
        ),
        jsonb_build_object(
          'type', 'section',
          'fields', p_payload->'fields'
        ),
        jsonb_build_object(
          'type', 'divider'
        ),
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', ':trophy: *Current Leaders*'
          )
        ),
        jsonb_build_object(
          'type', 'section',
          'fields', p_payload->'leaders'
        )
      );
      
    WHEN 'event_complete' THEN
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'header',
          'text', jsonb_build_object(
            'type', 'plain_text',
            'text', format('Event Complete: %s', p_payload->>'event_name'),
            'emoji', true
          )
        ),
        jsonb_build_object(
          'type', 'section',
          'fields', jsonb_build_array(
            jsonb_build_object(
              'type', 'mrkdwn',
              'text', format('*Artists:* %s', p_payload->>'total_artists')
            ),
            jsonb_build_object(
              'type', 'mrkdwn',
              'text', format('*Rounds:* %s', p_payload->>'total_rounds')
            ),
            jsonb_build_object(
              'type', 'mrkdwn',
              'text', format('*Voters:* %s', p_payload->>'total_voters')
            ),
            jsonb_build_object(
              'type', 'mrkdwn',
              'text', format('*Total Votes:* %s', p_payload->>'total_votes')
            )
          )
        ),
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', format(E':dollar: *Auction Summary*\nTotal: $%s\nBidders: %s',
              to_char(((p_payload->'auction_stats')->>'total_value')::numeric, 'FM999,999.00'),
              (p_payload->'auction_stats')->>'unique_bidders'
            )
          )
        )
      );
      
    ELSE
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', COALESCE(p_payload->>'message', 'Art Battle Notification')
          )
        )
      );
  END CASE;
END;
$$ LANGUAGE plpgsql;