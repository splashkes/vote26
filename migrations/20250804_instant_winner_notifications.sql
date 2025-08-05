-- Update auction closing to send instant SMS notifications to winners

-- First, let's update the check_and_close_expired_auctions function to use instant SMS
CREATE OR REPLACE FUNCTION check_and_close_expired_auctions()
RETURNS INTEGER AS $$
DECLARE
  v_art RECORD;
  v_closed_count INTEGER := 0;
  v_winner RECORD;
  v_channel_id VARCHAR;
  v_event RECORD;
  v_notifications INTEGER := 0;
  v_message_id UUID;
BEGIN
  -- Find all art pieces that should be closed
  FOR v_art IN
    SELECT 
      a.id,
      a.art_code,
      a.event_id,
      a.current_bid,
      a.round,
      a.easel,
      a.winner_id,
      COALESCE(ap.name, 'Artist') as artist_name,
      COALESCE(e.currency, '$') as currency,
      e.name as event_name,
      e.tax
    FROM art a
    JOIN events e ON a.event_id = e.id
    LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
    WHERE a.status = 'active'
      AND a.closing_time IS NOT NULL
      AND a.closing_time <= NOW()
  LOOP
    -- Update status to closed
    UPDATE art
    SET 
      status = 'closed',
      updated_at = NOW()
    WHERE id = v_art.id;
    
    v_closed_count := v_closed_count + 1;
    
    -- Get highest bidder if any
    SELECT 
      b.person_id as id,
      b.amount,
      p.phone_number,
      p.auth_phone,
      p.nickname,
      p.mongo_id
    INTO v_winner
    FROM bids b
    JOIN people p ON b.person_id = p.id
    WHERE b.art_id = v_art.id
    ORDER BY b.amount DESC
    LIMIT 1;
    
    IF FOUND THEN
      -- Update winner_id
      UPDATE art
      SET winner_id = v_winner.id
      WHERE id = v_art.id;
      
      -- Send instant winner SMS notification
      DECLARE
        v_phone TEXT;
        v_total_with_tax NUMERIC;
        v_payment_url TEXT;
      BEGIN
        v_phone := COALESCE(v_winner.auth_phone, v_winner.phone_number);
        
        IF v_phone IS NOT NULL THEN
          -- Calculate total with tax
          v_total_with_tax := v_winner.amount * (1 + COALESCE(v_art.tax, 0) / 100.0);
          
          -- Generate payment URL with art code
          v_payment_url := format('https://artb.art/pay/%s', v_art.art_code);
          
          -- Send instant SMS
          v_message_id := send_sms_instantly(
            p_destination := v_phone,
            p_message_body := format(
              'Congratulations! You won %s by %s for %s%s (incl tax). Complete payment: %s',
              v_art.art_code,
              v_art.artist_name,
              v_art.currency,
              round(v_total_with_tax, 2),
              v_payment_url
            ),
            p_metadata := jsonb_build_object(
              'type', 'auction_winner',
              'art_id', v_art.id,
              'art_code', v_art.art_code,
              'amount', v_winner.amount,
              'total_with_tax', v_total_with_tax,
              'winner_id', v_winner.id,
              'payment_url', v_payment_url
            )
          );
          
          RAISE NOTICE 'Sent instant winner SMS to % for art %', v_phone, v_art.art_code;
          v_notifications := v_notifications + 1;
        END IF;
      END;
      
      -- Queue Slack notification (keep existing)
      SELECT resolve_slack_channel(COALESCE(es.channel_name, es.channel_id))
      INTO v_channel_id
      FROM event_slack_settings es
      WHERE es.event_id = v_art.event_id;
      
      IF v_channel_id IS NOT NULL THEN
        INSERT INTO slack_notifications (
          event_id,
          channel_id,
          notification_type,
          data,
          status
        ) VALUES (
          v_art.event_id,
          v_channel_id,
          'auction_won',
          jsonb_build_object(
            'art_id', v_art.id,
            'art_code', v_art.art_code,
            'artist_name', v_art.artist_name,
            'winner_id', v_winner.id,
            'winner_name', v_winner.nickname,
            'amount', v_winner.amount,
            'currency', v_art.currency,
            'round', v_art.round,
            'easel', v_art.easel
          ),
          'pending'
        );
      END IF;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Closed % auctions, sent % notifications', v_closed_count, v_notifications;
  
  RETURN v_closed_count;
END;
$$ LANGUAGE plpgsql;

-- Also create a manual function to close a specific auction (for testing)
CREATE OR REPLACE FUNCTION close_auction_manually(
  p_art_code TEXT
) RETURNS JSONB AS $$
DECLARE
  v_art RECORD;
  v_winner RECORD;
  v_message_id UUID;
  v_phone TEXT;
  v_total_with_tax NUMERIC;
  v_payment_url TEXT;
BEGIN
  -- Get art details
  SELECT 
    a.id,
    a.art_code,
    a.event_id,
    a.current_bid,
    a.status,
    a.round,
    a.easel,
    COALESCE(ap.name, 'Artist') as artist_name,
    COALESCE(e.currency, '$') as currency,
    e.name as event_name,
    e.tax
  INTO v_art
  FROM art a
  JOIN events e ON a.event_id = e.id
  LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
  WHERE a.art_code = p_art_code;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Art not found');
  END IF;
  
  IF v_art.status = 'closed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Auction already closed');
  END IF;
  
  -- Get highest bidder
  SELECT 
    b.person_id as id,
    b.amount,
    p.phone_number,
    p.auth_phone,
    p.nickname
  INTO v_winner
  FROM bids b
  JOIN people p ON b.person_id = p.id
  WHERE b.art_id = v_art.id
  ORDER BY b.amount DESC
  LIMIT 1;
  
  IF NOT FOUND THEN
    -- Close without winner
    UPDATE art
    SET status = 'closed', updated_at = NOW()
    WHERE id = v_art.id;
    
    RETURN jsonb_build_object(
      'success', true, 
      'message', 'Auction closed with no bids'
    );
  END IF;
  
  -- Close with winner
  UPDATE art
  SET 
    status = 'closed',
    winner_id = v_winner.id,
    updated_at = NOW()
  WHERE id = v_art.id;
  
  -- Send instant winner SMS
  v_phone := COALESCE(v_winner.auth_phone, v_winner.phone_number);
  
  IF v_phone IS NOT NULL THEN
    -- Calculate total with tax
    v_total_with_tax := v_winner.amount * (1 + COALESCE(v_art.tax, 0) / 100.0);
    
    -- Generate payment URL
    v_payment_url := format('https://artb.art/pay/%s', v_art.art_code);
    
    -- Send instant SMS
    v_message_id := send_sms_instantly(
      p_destination := v_phone,
      p_message_body := format(
        'Congratulations! You won %s by %s for %s%s (incl tax). Complete payment: %s',
        v_art.art_code,
        v_art.artist_name,
        v_art.currency,
        round(v_total_with_tax, 2),
        v_payment_url
      ),
      p_metadata := jsonb_build_object(
        'type', 'auction_winner',
        'art_id', v_art.id,
        'art_code', v_art.art_code,
        'amount', v_winner.amount,
        'total_with_tax', v_total_with_tax,
        'winner_id', v_winner.id
      )
    );
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Auction closed successfully',
    'winner', jsonb_build_object(
      'id', v_winner.id,
      'nickname', v_winner.nickname,
      'amount', v_winner.amount,
      'total_with_tax', v_total_with_tax,
      'sms_sent', v_message_id IS NOT NULL
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;