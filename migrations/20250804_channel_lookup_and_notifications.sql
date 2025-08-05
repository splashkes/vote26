-- Channel name lookup and new event notifications

-- 1. Create table for channel name to ID mapping
CREATE TABLE IF NOT EXISTS slack_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_name VARCHAR(100) UNIQUE NOT NULL,
  channel_id VARCHAR(100) NOT NULL,
  workspace VARCHAR(100) DEFAULT 'artbattle',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for lookups
CREATE INDEX IF NOT EXISTS idx_slack_channels_name ON slack_channels(channel_name);

-- Insert known channels
INSERT INTO slack_channels (channel_name, channel_id) VALUES
('from-artb', 'C08QG87U3D0'),
('art-battle-notifications', 'C08QG87U3D0')  -- Alias for same channel
ON CONFLICT (channel_name) DO UPDATE SET channel_id = EXCLUDED.channel_id;

-- 2. Update event_slack_settings to support both channel ID and name
ALTER TABLE event_slack_settings 
ADD COLUMN IF NOT EXISTS channel_name VARCHAR(100);

-- 3. Function to resolve channel name to ID
CREATE OR REPLACE FUNCTION resolve_slack_channel(p_channel VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
  v_channel_id VARCHAR;
BEGIN
  -- If it already looks like a channel ID (starts with C, G, or D), return as-is
  IF p_channel ~ '^[CGD][0-9A-Z]+$' THEN
    RETURN p_channel;
  END IF;
  
  -- Remove # if present
  p_channel := LTRIM(p_channel, '#');
  
  -- Look up the channel ID
  SELECT channel_id INTO v_channel_id
  FROM slack_channels
  WHERE channel_name = p_channel
    AND active = true
  LIMIT 1;
  
  -- Return the ID if found, otherwise return the original (maybe it's already an ID)
  RETURN COALESCE(v_channel_id, p_channel);
END;
$$ LANGUAGE plpgsql;

-- 4. Update notification queueing functions to resolve channel names
CREATE OR REPLACE FUNCTION queue_vote_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_event_settings RECORD;
  v_vote_count INT;
  v_artist_name VARCHAR;
  v_event_name VARCHAR;
  v_channel_id VARCHAR;
BEGIN
  -- Get event slack settings
  SELECT es.*, e.name as event_name
  INTO v_event_settings 
  FROM event_slack_settings es
  JOIN events e ON e.id = es.event_id
  WHERE es.event_id = NEW.event_id;
  
  -- Resolve channel name to ID
  v_channel_id := resolve_slack_channel(COALESCE(v_event_settings.channel_name, v_event_settings.channel_id));
  
  -- Only proceed if notifications are enabled and channel is set
  IF v_event_settings.vote_notifications AND v_channel_id IS NOT NULL THEN
    -- Get current vote count for this art piece
    SELECT COUNT(*) INTO v_vote_count
    FROM votes
    WHERE art_id = NEW.art_id;
    
    -- Get artist name
    SELECT ap.name INTO v_artist_name
    FROM art a
    JOIN artist_profiles ap ON a.artist_id = ap.id
    WHERE a.id = NEW.art_id;
    
    -- Queue notification for every 10th vote to avoid spam
    IF v_vote_count % 10 = 0 OR v_vote_count = 1 THEN
      INSERT INTO slack_notifications (
        event_id, 
        channel_id, 
        message_type, 
        payload
      ) VALUES (
        NEW.event_id,
        v_channel_id,
        'vote_update',
        jsonb_build_object(
          'art_id', NEW.art_id,
          'artist_name', v_artist_name,
          'vote_count', v_vote_count,
          'round', NEW.round,
          'voter_id', NEW.person_id
        )
      );
    END IF;
    
    -- Check for milestones
    IF v_vote_count IN (100, 500, 1000, 5000) THEN
      INSERT INTO slack_notifications (
        event_id, 
        channel_id, 
        message_type, 
        payload
      ) VALUES (
        NEW.event_id,
        v_channel_id,
        'vote_milestone',
        jsonb_build_object(
          'milestone', v_vote_count,
          'event_name', v_event_settings.event_name
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Similar update for bid notifications
CREATE OR REPLACE FUNCTION queue_bid_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_event_settings RECORD;
  v_threshold NUMERIC;
  v_artist_name VARCHAR;
  v_art_code VARCHAR;
  v_event_id UUID;
  v_channel_id VARCHAR;
BEGIN
  -- Get event ID from art table
  SELECT event_id, art_code INTO v_event_id, v_art_code
  FROM art 
  WHERE id = NEW.art_id;
  
  -- Get event settings
  SELECT * INTO v_event_settings
  FROM event_slack_settings
  WHERE event_id = v_event_id;
  
  -- Resolve channel name to ID
  v_channel_id := resolve_slack_channel(COALESCE(v_event_settings.channel_name, v_event_settings.channel_id));
  
  -- Check if we should send notification
  IF v_event_settings.bid_notifications AND v_channel_id IS NOT NULL THEN
    -- Get threshold
    v_threshold := COALESCE(
      (v_event_settings.threshold_settings->>'min_bid_amount')::NUMERIC, 
      100
    );
    
    -- Only notify for bids above threshold
    IF NEW.amount >= v_threshold THEN
      -- Get artist info
      SELECT ap.name INTO v_artist_name
      FROM art a
      JOIN artist_profiles ap ON a.artist_id = ap.id
      WHERE a.id = NEW.art_id;
      
      -- Queue notification
      INSERT INTO slack_notifications (
        event_id,
        channel_id,
        message_type,
        payload
      ) VALUES (
        v_event_id,
        v_channel_id,
        'new_bid',
        jsonb_build_object(
          'art_id', NEW.art_id,
          'art_code', v_art_code,
          'artist_name', v_artist_name,
          'bid_amount', NEW.amount,
          'bidder_id', NEW.person_id,
          'is_high_value', NEW.amount > 1000
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Add new notification types to format_slack_message
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
      
    WHEN 'auction_closing_soon' THEN
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', format(E':alarm_clock: *Auction Closing Soon!*\nEvent: %s\n:warning: Closing in %s minutes\nActive artworks: %s',
              p_payload->>'event_name',
              p_payload->>'minutes_left',
              p_payload->>'active_artworks'
            )
          )
        ),
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', E':point_right: Place your final bids now!'
          )
        )
      );
      
    WHEN 'round_starting' THEN
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'header',
          'text', jsonb_build_object(
            'type', 'plain_text',
            'text', format('Round %s Starting!', p_payload->>'round_number'),
            'emoji', true
          )
        ),
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', format(E':art: *Artists competing:*\n%s', p_payload->>'artist_list')
          )
        ),
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', ':ballot_box_with_ballot: *Voting is OPEN!*'
          )
        )
      );
      
    WHEN 'lead_change' THEN
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', format(E':arrows_counterclockwise: *Lead Change in Round %s!*\n:first_place_medal: New Leader: %s (%s votes)\n:second_place_medal: Previous Leader: %s (%s votes)\nDifference: %s votes',
              p_payload->>'round',
              p_payload->>'new_leader',
              p_payload->>'new_leader_votes',
              p_payload->>'previous_leader',
              p_payload->>'previous_leader_votes',
              p_payload->>'vote_difference'
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

-- 7. Function to check for auction closing
CREATE OR REPLACE FUNCTION check_auction_closing()
RETURNS void AS $$
DECLARE
  v_event RECORD;
  v_channel_id VARCHAR;
  v_active_count INT;
BEGIN
  FOR v_event IN 
    SELECT e.*, es.channel_id as es_channel_id, es.channel_name
    FROM events e
    JOIN event_slack_settings es ON es.event_id = e.id
    WHERE e.enabled = true
      AND e.enable_auction = true
      AND e.auction_close_starts_at BETWEEN NOW() AND NOW() + INTERVAL '5 minutes'
      AND NOT EXISTS (
        SELECT 1 FROM slack_notifications 
        WHERE event_id = e.id 
        AND message_type = 'auction_closing_soon'
        AND created_at > NOW() - INTERVAL '10 minutes'
      )
  LOOP
    -- Resolve channel
    v_channel_id := resolve_slack_channel(COALESCE(v_event.channel_name, v_event.es_channel_id));
    
    IF v_channel_id IS NOT NULL THEN
      -- Count active artworks with bids
      SELECT COUNT(DISTINCT a.id) INTO v_active_count
      FROM art a
      WHERE a.event_id = v_event.id
        AND EXISTS (SELECT 1 FROM bids WHERE art_id = a.id);
      
      INSERT INTO slack_notifications (
        event_id,
        channel_id,
        message_type,
        payload
      ) VALUES (
        v_event.id,
        v_channel_id,
        'auction_closing_soon',
        jsonb_build_object(
          'event_name', v_event.name,
          'minutes_left', 5,
          'active_artworks', v_active_count
        )
      );
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 8. Function to detect and notify lead changes
CREATE OR REPLACE FUNCTION check_lead_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_event_settings RECORD;
  v_current_leader RECORD;
  v_previous_leader RECORD;
  v_round INT;
  v_channel_id VARCHAR;
BEGIN
  -- Get round from art
  SELECT round, event_id INTO v_round, NEW.event_id
  FROM art WHERE id = NEW.art_id;
  
  -- Get event settings
  SELECT * INTO v_event_settings
  FROM event_slack_settings
  WHERE event_id = NEW.event_id;
  
  -- Resolve channel
  v_channel_id := resolve_slack_channel(COALESCE(v_event_settings.channel_name, v_event_settings.channel_id));
  
  IF v_event_settings.vote_notifications AND v_channel_id IS NOT NULL THEN
    -- Get current leader
    WITH vote_counts AS (
      SELECT 
        a.artist_id,
        ap.name as artist_name,
        COUNT(v.id) as vote_count,
        ROW_NUMBER() OVER (ORDER BY COUNT(v.id) DESC) as rank
      FROM art a
      JOIN artist_profiles ap ON a.artist_id = ap.id
      LEFT JOIN votes v ON v.art_id = a.id
      WHERE a.event_id = NEW.event_id
        AND a.round = v_round
      GROUP BY a.artist_id, ap.name
    )
    SELECT artist_id, artist_name, vote_count
    INTO v_current_leader
    FROM vote_counts
    WHERE rank = 1;
    
    -- Check if there was a previous notification for this round
    SELECT payload->>'new_leader' as artist_name, 
           (payload->>'new_leader_votes')::int as vote_count
    INTO v_previous_leader
    FROM slack_notifications
    WHERE event_id = NEW.event_id
      AND message_type = 'lead_change'
      AND (payload->>'round')::int = v_round
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- If no previous leader, check if this is first significant lead
    IF v_previous_leader.artist_name IS NULL AND v_current_leader.vote_count >= 10 THEN
      INSERT INTO slack_notifications (
        event_id,
        channel_id,
        message_type,
        payload
      ) VALUES (
        NEW.event_id,
        v_channel_id,
        'lead_change',
        jsonb_build_object(
          'round', v_round,
          'new_leader', v_current_leader.artist_name,
          'new_leader_votes', v_current_leader.vote_count,
          'previous_leader', 'No previous leader',
          'previous_leader_votes', 0,
          'vote_difference', v_current_leader.vote_count
        )
      );
    -- If leader changed
    ELSIF v_previous_leader.artist_name IS NOT NULL 
      AND v_previous_leader.artist_name != v_current_leader.artist_name 
      AND v_current_leader.vote_count > v_previous_leader.vote_count THEN
      
      INSERT INTO slack_notifications (
        event_id,
        channel_id,
        message_type,
        payload
      ) VALUES (
        NEW.event_id,
        v_channel_id,
        'lead_change',
        jsonb_build_object(
          'round', v_round,
          'new_leader', v_current_leader.artist_name,
          'new_leader_votes', v_current_leader.vote_count,
          'previous_leader', v_previous_leader.artist_name,
          'previous_leader_votes', v_previous_leader.vote_count,
          'vote_difference', v_current_leader.vote_count - v_previous_leader.vote_count
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for lead changes (fires after vote insert)
DROP TRIGGER IF EXISTS check_lead_change_trigger ON votes;
CREATE TRIGGER check_lead_change_trigger
AFTER INSERT ON votes
FOR EACH ROW
EXECUTE FUNCTION check_lead_changes();

-- 9. Function to notify round starting
CREATE OR REPLACE FUNCTION notify_round_starting()
RETURNS TRIGGER AS $$
DECLARE
  v_event_settings RECORD;
  v_artist_list TEXT;
  v_channel_id VARCHAR;
BEGIN
  -- Only trigger when round number changes
  IF NEW.current_round != OLD.current_round THEN
    -- Get event settings
    SELECT * INTO v_event_settings
    FROM event_slack_settings
    WHERE event_id = NEW.id;
    
    -- Resolve channel
    v_channel_id := resolve_slack_channel(COALESCE(v_event_settings.channel_name, v_event_settings.channel_id));
    
    IF v_event_settings.round_notifications AND v_channel_id IS NOT NULL THEN
      -- Get artists for this round
      SELECT string_agg(ap.name, E'\n', ap.name) INTO v_artist_list
      FROM art a
      JOIN artist_profiles ap ON a.artist_id = ap.id
      WHERE a.event_id = NEW.id
        AND a.round = NEW.current_round
      ORDER BY a.easel;
      
      INSERT INTO slack_notifications (
        event_id,
        channel_id,
        message_type,
        payload
      ) VALUES (
        NEW.id,
        v_channel_id,
        'round_starting',
        jsonb_build_object(
          'round_number', NEW.current_round,
          'artist_list', COALESCE(v_artist_list, 'Artists being assigned...')
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for round changes
DROP TRIGGER IF EXISTS notify_round_start_trigger ON events;
CREATE TRIGGER notify_round_start_trigger
AFTER UPDATE ON events
FOR EACH ROW
WHEN (OLD.current_round IS DISTINCT FROM NEW.current_round)
EXECUTE FUNCTION notify_round_starting();

-- 10. Update existing test event to use channel name
UPDATE event_slack_settings 
SET channel_name = 'from-artb'
WHERE event_id IN (
  SELECT id FROM events WHERE eid IN ('TEST123', 'AB3032')
);

-- 11. Function to add/update channel mapping
CREATE OR REPLACE FUNCTION add_slack_channel(
  p_channel_name VARCHAR,
  p_channel_id VARCHAR
) RETURNS VOID AS $$
BEGIN
  INSERT INTO slack_channels (channel_name, channel_id)
  VALUES (LTRIM(p_channel_name, '#'), p_channel_id)
  ON CONFLICT (channel_name) 
  DO UPDATE SET 
    channel_id = EXCLUDED.channel_id,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT ALL ON slack_channels TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_slack_channel(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION check_auction_closing() TO authenticated;
GRANT EXECUTE ON FUNCTION add_slack_channel(VARCHAR, VARCHAR) TO authenticated;