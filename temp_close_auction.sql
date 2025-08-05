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
