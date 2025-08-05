-- Stale lot detection and handling

-- 1. Update check_and_close_expired_auctions to handle stale lots
CREATE OR REPLACE FUNCTION check_and_close_expired_auctions()
RETURNS TABLE(
  closed_with_bids INTEGER,
  closed_no_bids INTEGER,
  notifications_queued INTEGER
) AS $$
DECLARE
  v_art RECORD;
  v_closed_with_bids INTEGER := 0;
  v_closed_no_bids INTEGER := 0;
  v_notifications INTEGER := 0;
  v_winner RECORD;
  v_channel_id VARCHAR;
BEGIN
  -- Find all artworks that should be closed WITH BIDS
  FOR v_art IN
    SELECT a.*, e.currency, e.tax_percent, e.id as event_id
    FROM art a
    JOIN events e ON a.event_id = e.id
    WHERE a.status = 'active'
      AND a.closing_time IS NOT NULL
      AND a.closing_time < NOW()
      AND a.current_bid > 0
  LOOP
    -- Update status to closed
    UPDATE art
    SET 
      status = 'closed',
      updated_at = NOW()
    WHERE id = v_art.id;
    
    v_closed_with_bids := v_closed_with_bids + 1;
    
    -- Get winner information
    SELECT p.*, b.amount
    INTO v_winner
    FROM bids b
    JOIN people p ON b.person_id = p.id
    WHERE b.art_id = v_art.id
    ORDER BY b.amount DESC
    LIMIT 1;
    
    -- Update winner_id
    UPDATE art
    SET winner_id = v_winner.id
    WHERE id = v_art.id;
    
    -- Queue winner SMS notification
    IF v_winner.phone_number IS NOT NULL THEN
      INSERT INTO message_queue (
        channel,
        destination,
        message_body,
        metadata,
        status,
        priority,
        send_after,
        send_immediately
      ) VALUES (
        'sms',
        v_winner.phone_number,
        format('You have won %s by %s for %s%s. Please complete your payment at https://artb.art/pay/%s',
          v_art.art_code,
          COALESCE(v_art.artist_name, 'Artist'),
          COALESCE(v_art.currency, '$'),
          v_winner.amount,
          v_art.art_code
        ),
        jsonb_build_object(
          'type', 'auction_winner',
          'art_id', v_art.id,
          'art_code', v_art.art_code,
          'amount', v_winner.amount,
          'winner_id', v_winner.id
        ),
        'pending',
        1, -- high priority
        NOW(),
        true -- send immediately
      );
      
      v_notifications := v_notifications + 1;
    END IF;
    
    -- Queue Slack notification for successful auction
    SELECT resolve_slack_channel(COALESCE(es.channel_name, es.channel_id))
    INTO v_channel_id
    FROM event_slack_settings es
    WHERE es.event_id = v_art.event_id;
    
    IF v_channel_id IS NOT NULL THEN
      INSERT INTO slack_notifications (
        event_id,
        channel_id,
        message_type,
        payload
      ) VALUES (
        v_art.event_id,
        v_channel_id,
        'auction_closed',
        jsonb_build_object(
          'art_code', v_art.art_code,
          'artist_name', COALESCE(v_art.artist_name, 'Artist'),
          'final_bid', v_winner.amount,
          'winner_name', v_winner.nickname,
          'winner_phone', RIGHT(v_winner.phone_number, 4),
          'total_bids', v_art.bid_count
        )
      );
    END IF;
  END LOOP;
  
  -- Handle artworks with NO BIDS (stale lots)
  FOR v_art IN
    SELECT a.*, e.id as event_id
    FROM art a
    JOIN events e ON a.event_id = e.id
    WHERE a.status = 'active'
      AND a.closing_time IS NOT NULL
      AND a.closing_time < NOW()
      AND (a.current_bid IS NULL OR a.current_bid = 0)
  LOOP
    -- Update status to closed
    UPDATE art
    SET 
      status = 'closed',
      updated_at = NOW()
    WHERE id = v_art.id;
    
    v_closed_no_bids := v_closed_no_bids + 1;
    
    -- Queue Slack notification for stale lot
    SELECT resolve_slack_channel(COALESCE(es.channel_name, es.channel_id))
    INTO v_channel_id
    FROM event_slack_settings es
    WHERE es.event_id = v_art.event_id;
    
    IF v_channel_id IS NOT NULL THEN
      INSERT INTO slack_notifications (
        event_id,
        channel_id,
        message_type,
        payload
      ) VALUES (
        v_art.event_id,
        v_channel_id,
        'auction_closed_no_bids',
        jsonb_build_object(
          'art_code', v_art.art_code,
          'artist_name', COALESCE(v_art.artist_name, 'Artist'),
          'starting_bid', v_art.starting_bid
        )
      );
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT v_closed_with_bids, v_closed_no_bids, v_notifications;
END;
$$ LANGUAGE plpgsql;

-- 2. Add format for stale lot notifications
CREATE OR REPLACE FUNCTION format_slack_message(
  p_type VARCHAR,
  p_payload JSONB
) RETURNS JSONB AS $$
BEGIN
  CASE p_type
    WHEN 'auction_closed_no_bids' THEN
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', format(E':warning: *No Bids - Auction Closed*\nArtwork: %s by %s\nStarting bid was %s\nNo bids were placed on this artwork.',
              p_payload->>'art_code',
              p_payload->>'artist_name',
              p_payload->>'starting_bid'
            )
          )
        )
      );
    WHEN 'auction_extended' THEN
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', format(E':alarm_clock: *Auction Extended!*\nLate bid triggered a 5-minute extension\nNew closing time: %s (%s)\nExtension #%s',
              to_char((p_payload->>'new_closing')::timestamptz, 'HH24:MI:SS'),
              p_payload->>'time_zone',
              p_payload->>'extension_number'
            )
          )
        )
      );
    WHEN 'auction_closed' THEN
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', format(E':hammer: *Auction Closed - SOLD!*\nArtwork: %s by %s\nFinal bid: $%s\nWinner: %s (***-%s)\nTotal bids: %s',
              p_payload->>'art_code',
              p_payload->>'artist_name',
              p_payload->>'final_bid',
              p_payload->>'winner_name',
              p_payload->>'winner_phone',
              p_payload->>'total_bids'
            )
          )
        )
      );
    -- Include all other existing WHEN clauses here...
    ELSE
      -- Return existing default
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

-- 3. Create view to monitor stale lots
CREATE OR REPLACE VIEW v_auction_stale_lots AS
SELECT 
  a.id,
  a.art_code,
  a.event_id,
  e.name as event_name,
  ap.name as artist_name,
  a.starting_bid,
  a.closing_time,
  a.created_at,
  CASE 
    WHEN a.closing_time < NOW() THEN 'expired'
    WHEN a.closing_time < NOW() + INTERVAL '1 hour' THEN 'closing_soon'
    ELSE 'active'
  END as urgency
FROM art a
JOIN events e ON a.event_id = e.id
LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
WHERE a.status = 'active'
  AND a.bid_count = 0
  AND a.closing_time IS NOT NULL
ORDER BY a.closing_time;

-- 4. Grant permissions
GRANT SELECT ON v_auction_stale_lots TO authenticated;