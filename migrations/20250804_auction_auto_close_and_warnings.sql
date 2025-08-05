-- Auction Auto-Close and Warning System
-- Handles automatic closing of expired auctions and sends 5-minute warnings

-- Function to check and close expired auctions
CREATE OR REPLACE FUNCTION check_and_close_expired_auctions()
RETURNS JSONB AS $$
DECLARE
  v_closed_count INT := 0;
  v_artwork RECORD;
  v_event RECORD;
BEGIN
  -- Find all active artworks with expired closing times
  FOR v_artwork IN 
    SELECT 
      a.*,
      e.name as event_name,
      e.currency,
      e.tax,
      COALESCE(ap.name, 'Artist') as artist_name
    FROM art a
    JOIN events e ON a.event_id = e.id
    LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
    WHERE a.status = 'active'
    AND a.closing_time IS NOT NULL
    AND a.closing_time <= NOW()
    FOR UPDATE OF a
  LOOP
    -- Close the auction
    UPDATE art
    SET 
      status = 'closed',
      updated_at = NOW()
    WHERE id = v_artwork.id;
    
    v_closed_count := v_closed_count + 1;
    
    -- The trigger_auction_closed_notification will handle winner notifications
    RAISE NOTICE 'Auto-closed auction for %', v_artwork.art_code;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'closed_count', v_closed_count,
    'timestamp', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to send 5-minute warnings to bidders
CREATE OR REPLACE FUNCTION send_auction_closing_warnings()
RETURNS JSONB AS $$
DECLARE
  v_artwork RECORD;
  v_bidder RECORD;
  v_highest_bid RECORD;
  v_sms_count INT := 0;
  v_message TEXT;
  v_message_id UUID;
  v_event RECORD;
BEGIN
  -- Find all artworks closing in 5-6 minutes (run this every minute)
  FOR v_artwork IN 
    SELECT 
      a.*,
      e.name as event_name,
      e.currency,
      COALESCE(ap.name, 'Artist') as artist_name
    FROM art a
    JOIN events e ON a.event_id = e.id
    LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
    WHERE a.status = 'active'
    AND a.closing_time IS NOT NULL
    AND a.closing_time > NOW()
    AND a.closing_time <= NOW() + INTERVAL '6 minutes'
    AND a.closing_time > NOW() + INTERVAL '4 minutes'
    -- Only send once by checking if we've sent warnings for this artwork
    AND NOT EXISTS (
      SELECT 1 FROM sms_messages sm
      WHERE sm.metadata->>'art_id' = a.id::text
      AND sm.metadata->>'type' = 'closing_warning'
      AND sm.created_at > NOW() - INTERVAL '10 minutes'
    )
  LOOP
    -- Get the highest bid
    SELECT 
      b.amount,
      b.person_id,
      p.id as person_id,
      COALESCE(p.auth_phone, p.phone_number) as phone,
      p.nickname
    INTO v_highest_bid
    FROM bids b
    JOIN people p ON b.person_id = p.id
    WHERE b.art_id = v_artwork.id
    ORDER BY b.amount DESC
    LIMIT 1;
    
    -- Send messages to all bidders on this artwork
    FOR v_bidder IN 
      SELECT DISTINCT
        b.person_id,
        p.nickname,
        COALESCE(p.auth_phone, p.phone_number) as phone,
        MAX(b.amount) as highest_bid_amount
      FROM bids b
      JOIN people p ON b.person_id = p.id
      WHERE b.art_id = v_artwork.id
      AND COALESCE(p.auth_phone, p.phone_number) IS NOT NULL
      GROUP BY b.person_id, p.nickname, p.phone_number, p.auth_phone
    LOOP
      -- Determine if they're winning
      IF v_bidder.person_id = v_highest_bid.person_id THEN
        -- Winning message
        v_message := format(
          'You are WINNING %s at %s%s! Bidding closes in 5 min. If outbid, auction extends 5 min. Good luck!',
          v_artwork.art_code,
          COALESCE(v_artwork.currency, '$'),
          v_bidder.highest_bid_amount
        );
      ELSE
        -- Not winning message
        v_message := format(
          'You are NOT WINNING %s (current: %s%s). To take this painting home, bid again! Closes in 5 min.',
          v_artwork.art_code,
          COALESCE(v_artwork.currency, '$'),
          v_highest_bid.amount
        );
      END IF;
      
      -- Send SMS instantly
      v_message_id := send_sms_instantly(
        p_destination := v_bidder.phone,
        p_message_body := v_message,
        p_metadata := jsonb_build_object(
          'type', 'closing_warning',
          'art_id', v_artwork.id,
          'art_code', v_artwork.art_code,
          'person_id', v_bidder.person_id,
          'is_winning', v_bidder.person_id = v_highest_bid.person_id,
          'current_bid', v_highest_bid.amount,
          'their_bid', v_bidder.highest_bid_amount
        )
      );
      
      IF v_message_id IS NOT NULL THEN
        v_sms_count := v_sms_count + 1;
      END IF;
    END LOOP;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'sms_sent', v_sms_count,
    'timestamp', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function that combines both checks (to be called periodically)
CREATE OR REPLACE FUNCTION process_auction_timers()
RETURNS JSONB AS $$
DECLARE
  v_warnings_result JSONB;
  v_close_result JSONB;
BEGIN
  -- First send warnings for auctions closing soon
  v_warnings_result := send_auction_closing_warnings();
  
  -- Then close any expired auctions
  v_close_result := check_and_close_expired_auctions();
  
  RETURN jsonb_build_object(
    'success', true,
    'warnings', v_warnings_result,
    'closures', v_close_result,
    'timestamp', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION check_and_close_expired_auctions TO authenticated, anon;
GRANT EXECUTE ON FUNCTION send_auction_closing_warnings TO authenticated, anon;
GRANT EXECUTE ON FUNCTION process_auction_timers TO authenticated, anon;

-- Create an Edge Function to call this periodically
-- This would be called by a cron job or external scheduler