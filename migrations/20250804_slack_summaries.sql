-- Slack Summary Functions
-- Functions to generate various summaries for Slack notifications

-- 1. Get current voting summary
CREATE OR REPLACE FUNCTION get_voting_summary(p_event_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_summary JSONB;
  v_total_votes INT;
  v_unique_voters INT;
  v_current_round INT;
BEGIN
  -- Get current round
  SELECT current_round INTO v_current_round
  FROM events
  WHERE id = p_event_id;
  
  -- Get voting stats
  SELECT 
    COUNT(*) as total_votes,
    COUNT(DISTINCT person_id) as unique_voters
  INTO v_total_votes, v_unique_voters
  FROM votes v
  JOIN art a ON v.art_id = a.id
  WHERE a.event_id = p_event_id
    AND v.round = v_current_round;
  
  -- Build summary
  v_summary := jsonb_build_object(
    'event_id', p_event_id,
    'current_round', v_current_round,
    'total_votes', v_total_votes,
    'unique_voters', v_unique_voters,
    'leaders', get_voting_leaders(p_event_id),
    'timestamp', NOW()
  );
  
  RETURN v_summary;
END;
$$ LANGUAGE plpgsql;

-- 2. Get auction summary
CREATE OR REPLACE FUNCTION get_auction_summary(p_event_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_summary JSONB;
BEGIN
  WITH bid_stats AS (
    SELECT 
      COUNT(DISTINCT b.id) as total_bids,
      COUNT(DISTINCT b.person_id) as unique_bidders,
      COUNT(DISTINCT b.art_id) as artworks_with_bids,
      MAX(b.amount) as highest_bid_amount
    FROM bids b
    JOIN art a ON b.art_id = a.id
    WHERE a.event_id = p_event_id
  ),
  current_values AS (
    SELECT SUM(max_bid) as total_current_value
    FROM (
      SELECT MAX(b.amount) as max_bid
      FROM bids b
      JOIN art a ON b.art_id = a.id
      WHERE a.event_id = p_event_id
      GROUP BY a.id
    ) max_bids
  ),
  top_bids AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'art_code', art_code,
        'artist_name', artist_name,
        'current_bid', current_bid
      ) ORDER BY current_bid DESC
    ) as top_artworks
    FROM (
      SELECT DISTINCT ON (a.id)
        a.art_code,
        ap.name as artist_name,
        b.amount as current_bid
      FROM art a
      JOIN artist_profiles ap ON a.artist_id = ap.id
      JOIN bids b ON b.art_id = a.id
      WHERE a.event_id = p_event_id
      ORDER BY a.id, b.amount DESC
      LIMIT 5
    ) top
  )
  SELECT jsonb_build_object(
    'total_bids', COALESCE(bs.total_bids, 0),
    'unique_bidders', COALESCE(bs.unique_bidders, 0),
    'artworks_with_bids', COALESCE(bs.artworks_with_bids, 0),
    'highest_bid', COALESCE(bs.highest_bid_amount, 0),
    'total_value', COALESCE(cv.total_current_value, 0),
    'top_artworks', COALESCE(tb.top_artworks, '[]'::jsonb)
  ) INTO v_summary
  FROM bid_stats bs
  CROSS JOIN current_values cv
  CROSS JOIN top_bids tb;
  
  RETURN v_summary;
END;
$$ LANGUAGE plpgsql;

-- 3. Generate hourly summary notification
CREATE OR REPLACE FUNCTION generate_hourly_summary(p_event_id UUID)
RETURNS VOID AS $$
DECLARE
  v_event_settings RECORD;
  v_voting_summary JSONB;
  v_auction_summary JSONB;
  v_message_fields JSONB;
BEGIN
  -- Get event settings
  SELECT es.*, e.name as event_name, e.eid
  INTO v_event_settings
  FROM event_slack_settings es
  JOIN events e ON es.event_id = e.id
  WHERE es.event_id = p_event_id;
  
  IF v_event_settings.channel_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Get summaries
  v_voting_summary := get_voting_summary(p_event_id);
  v_auction_summary := get_auction_summary(p_event_id);
  
  -- Build message fields
  v_message_fields := jsonb_build_array(
    jsonb_build_object(
      'type', 'mrkdwn',
      'text', format('*Event:* %s (%s)', v_event_settings.event_name, v_event_settings.eid)
    ),
    jsonb_build_object(
      'type', 'mrkdwn',
      'text', format('*Round:* %s', v_voting_summary->>'current_round')
    ),
    jsonb_build_object(
      'type', 'mrkdwn',
      'text', format('*Total Votes:* %s', v_voting_summary->>'total_votes')
    ),
    jsonb_build_object(
      'type', 'mrkdwn',
      'text', format('*Unique Voters:* %s', v_voting_summary->>'unique_voters')
    ),
    jsonb_build_object(
      'type', 'mrkdwn',
      'text', format('*Total Bids:* %s', v_auction_summary->>'total_bids')
    ),
    jsonb_build_object(
      'type', 'mrkdwn',
      'text', format('*Auction Value:* $%s', 
        to_char((v_auction_summary->>'total_value')::numeric, 'FM999,999.00')
      )
    )
  );
  
  -- Queue the summary notification
  INSERT INTO slack_notifications (
    event_id,
    channel_id,
    message_type,
    payload
  ) VALUES (
    p_event_id,
    v_event_settings.channel_id,
    'hourly_summary',
    jsonb_build_object(
      'message', format('Hourly Summary for %s', v_event_settings.event_name),
      'leaders', v_voting_summary->'leaders',
      'fields', v_message_fields,
      'voting_summary', v_voting_summary,
      'auction_summary', v_auction_summary
    )
  );
END;
$$ LANGUAGE plpgsql;

-- 4. Generate event completion summary
CREATE OR REPLACE FUNCTION generate_event_completion_summary(p_event_id UUID)
RETURNS VOID AS $$
DECLARE
  v_event_settings RECORD;
  v_event_stats RECORD;
  v_top_artists JSONB;
  v_auction_stats JSONB;
BEGIN
  -- Get event settings
  SELECT es.*, e.name as event_name, e.eid
  INTO v_event_settings
  FROM event_slack_settings es
  JOIN events e ON es.event_id = e.id
  WHERE es.event_id = p_event_id;
  
  IF v_event_settings.channel_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Get overall event statistics
  WITH stats AS (
    SELECT 
      COUNT(DISTINCT rc.artist_id) as total_artists,
      COUNT(DISTINCT r.id) as total_rounds,
      COUNT(DISTINCT v.person_id) as total_voters,
      COUNT(v.id) as total_votes
    FROM rounds r
    LEFT JOIN round_contestants rc ON rc.round_id = r.id
    LEFT JOIN art a ON a.event_id = r.event_id
    LEFT JOIN votes v ON v.art_id = a.id
    WHERE r.event_id = p_event_id
  )
  SELECT * INTO v_event_stats FROM stats;
  
  -- Get top 3 artists by votes
  SELECT jsonb_agg(
    jsonb_build_object(
      'name', artist_name,
      'votes', total_votes,
      'rounds_won', rounds_won
    ) ORDER BY total_votes DESC
  ) INTO v_top_artists
  FROM (
    SELECT 
      ap.name as artist_name,
      COUNT(v.id) as total_votes,
      COUNT(DISTINCT rc.round_id) FILTER (WHERE rc.is_winner = 1) as rounds_won
    FROM artist_profiles ap
    JOIN art a ON a.artist_id = ap.id
    LEFT JOIN votes v ON v.art_id = a.id
    LEFT JOIN round_contestants rc ON rc.artist_id = ap.id
    WHERE a.event_id = p_event_id
    GROUP BY ap.id
    ORDER BY total_votes DESC
    LIMIT 3
  ) top_artists;
  
  -- Get auction statistics
  v_auction_stats := get_auction_summary(p_event_id);
  
  -- Create completion summary notification
  INSERT INTO slack_notifications (
    event_id,
    channel_id,
    message_type,
    payload
  ) VALUES (
    p_event_id,
    v_event_settings.channel_id,
    'event_complete',
    jsonb_build_object(
      'event_name', v_event_settings.event_name,
      'event_eid', v_event_settings.eid,
      'total_artists', v_event_stats.total_artists,
      'total_rounds', v_event_stats.total_rounds,
      'total_voters', v_event_stats.total_voters,
      'total_votes', v_event_stats.total_votes,
      'top_artists', v_top_artists,
      'auction_stats', v_auction_stats
    )
  );
END;
$$ LANGUAGE plpgsql;

-- 5. Add message formatter for new summary types
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
            'text', format('🗳️ *New Vote!*\nArtist: %s\nTotal Votes: %s\nRound: %s',
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
            'text', format('💰 %s*New Bid!*\nArtwork: %s by %s\nAmount: $%s',
              CASE WHEN (p_payload->>'is_high_value')::boolean 
                THEN '🔥 ' ELSE '' END,
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
            'text', format('🏁 *Round %s Complete!*\nWinner: %s\nVotes: %s',
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
            'text', format('🎉 *Voting Milestone!*\n%s votes reached!\nEvent: %s',
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
            'text', '📊 Hourly Event Summary'
          )
        ),
        jsonb_build_object(
          'type', 'section',
          'fields', p_payload->'fields'
        ),
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', '*Current Leaders:*'
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
            'text', format('🎊 Event Complete: %s', p_payload->>'event_name')
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
            'text', format('*Auction Total:* $%s\n*Unique Bidders:* %s',
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

-- 6. Function to generate all active event summaries
CREATE OR REPLACE FUNCTION generate_all_hourly_summaries()
RETURNS JSONB AS $$
DECLARE
  v_event_id UUID;
  v_count INT := 0;
BEGIN
  -- Generate summaries for all active events with Slack channels configured
  FOR v_event_id IN
    SELECT DISTINCT e.id
    FROM events e
    JOIN event_slack_settings es ON es.event_id = e.id
    WHERE e.enabled = true
      AND es.channel_id IS NOT NULL
      AND e.event_start_datetime <= NOW()
      AND (e.event_end_datetime IS NULL OR e.event_end_datetime >= NOW())
  LOOP
    PERFORM generate_hourly_summary(v_event_id);
    v_count := v_count + 1;
  END LOOP;
  
  RETURN jsonb_build_object(
    'events_processed', v_count,
    'timestamp', NOW()
  );
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_voting_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_auction_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_hourly_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_event_completion_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_all_hourly_summaries() TO authenticated;