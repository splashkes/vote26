-- Add NOT WINNING notifications for non-winning bidders when auction closes

-- Update the check_and_close_expired_auctions function to notify all bidders
CREATE OR REPLACE FUNCTION check_and_close_expired_auctions()
RETURNS TABLE(
  closed_count INTEGER,
  notifications_queued INTEGER
) AS $$
DECLARE
  v_art RECORD;
  v_closed INTEGER := 0;
  v_notifications INTEGER := 0;
  v_winner RECORD;
  v_bidder RECORD;
  v_channel_id VARCHAR;
  v_total_with_tax NUMERIC;
  v_payment_url TEXT;
BEGIN
  -- Find all artworks that should be closed
  FOR v_art IN
    SELECT 
      a.*, 
      e.currency, 
      e.tax as tax_percent, 
      e.id as event_id,
      COALESCE(ap.name, 'Artist') as artist_name
    FROM art a
    JOIN events e ON a.event_id = e.id
    LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
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
    
    v_closed := v_closed + 1;
    
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
    
    -- Calculate total with tax for winner
    v_total_with_tax := v_winner.amount * (1 + COALESCE(v_art.tax_percent, 0) / 100.0);
    v_payment_url := format('https://artb.art/pay/%s', v_art.art_code);
    
    -- Queue winner SMS notification using send_sms_instantly
    IF v_winner.phone_number IS NOT NULL OR v_winner.auth_phone IS NOT NULL THEN
      PERFORM send_sms_instantly(
        p_destination := COALESCE(v_winner.auth_phone, v_winner.phone_number),
        p_message_body := format(
          'Congratulations! You won %s by %s for %s%s (incl tax). Complete payment: %s',
          v_art.art_code,
          v_art.artist_name,
          COALESCE(v_art.currency, '$'),
          round(v_total_with_tax, 2),
          v_payment_url
        ),
        p_metadata := jsonb_build_object(
          'type', 'auction_winner',
          'art_id', v_art.id,
          'art_code', v_art.art_code,
          'amount', v_winner.amount,
          'total_with_tax', round(v_total_with_tax, 2),
          'winner_id', v_winner.id,
          'closed_by', 'auto_close'
        )
      );
      
      v_notifications := v_notifications + 1;
    END IF;
    
    -- Send NOT WINNING notifications to all other bidders on this artwork
    FOR v_bidder IN
      SELECT DISTINCT 
        p.id,
        p.nickname,
        COALESCE(p.auth_phone, p.phone_number) as phone,
        MAX(b.amount) as highest_bid
      FROM bids b
      JOIN people p ON b.person_id = p.id
      WHERE b.art_id = v_art.id
        AND p.id != v_winner.id  -- Exclude the winner
      GROUP BY p.id, p.nickname, p.auth_phone, p.phone_number
    LOOP
      IF v_bidder.phone IS NOT NULL THEN
        PERFORM send_sms_instantly(
          p_destination := v_bidder.phone,
          p_message_body := format(
            'NOT WINNING - %s by %s. Your highest bid: %s%s. Winner bid: %s%s',
            v_art.art_code,
            v_art.artist_name,
            COALESCE(v_art.currency, '$'),
            v_bidder.highest_bid,
            COALESCE(v_art.currency, '$'),
            v_winner.amount
          ),
          p_metadata := jsonb_build_object(
            'type', 'auction_not_winning',
            'art_id', v_art.id,
            'art_code', v_art.art_code,
            'bidder_id', v_bidder.id,
            'highest_bid', v_bidder.highest_bid,
            'winning_bid', v_winner.amount,
            'closed_by', 'auto_close'
          )
        );
        
        v_notifications := v_notifications + 1;
      END IF;
    END LOOP;
    
    -- Queue Slack notification
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
          'artist_name', v_art.artist_name,
          'final_bid', v_winner.amount,
          'winner_name', v_winner.nickname,
          'winner_phone', RIGHT(COALESCE(v_winner.auth_phone, v_winner.phone_number), 4),
          'total_bids', v_art.bid_count,
          'unique_bidders', (
            SELECT COUNT(DISTINCT person_id) 
            FROM bids 
            WHERE art_id = v_art.id
          )
        )
      );
    END IF;
  END LOOP;
  
  -- Handle artworks with no bids
  UPDATE art
  SET 
    status = 'closed',
    updated_at = NOW()
  WHERE status = 'active'
    AND closing_time IS NOT NULL
    AND closing_time < NOW()
    AND (current_bid IS NULL OR current_bid = 0);
  
  RETURN QUERY SELECT v_closed, v_notifications;
END;
$$ LANGUAGE plpgsql;

-- Also update admin_update_art_status to send NOT WINNING notifications when manually closing
CREATE OR REPLACE FUNCTION admin_update_art_status(
  p_art_code TEXT,
  p_new_status TEXT,
  p_admin_phone TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_art RECORD;
  v_old_status TEXT;
  v_winner RECORD;
  v_bidder RECORD;
  v_message_id UUID;
  v_phone TEXT;
  v_total_with_tax NUMERIC;
  v_payment_url TEXT;
  v_event RECORD;
  v_notifications_sent INTEGER := 0;
BEGIN
  -- Validate new status
  IF p_new_status NOT IN ('active', 'closed', 'sold', 'inactive') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid status. Must be active, closed, sold, or inactive'
    );
  END IF;
  
  -- Get art details
  SELECT 
    a.*,
    e.name as event_name,
    e.currency,
    e.tax,
    COALESCE(ap.name, 'Artist') as artist_name
  INTO v_art
  FROM art a
  JOIN events e ON a.event_id = e.id
  LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
  WHERE a.art_code = p_art_code;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Art not found');
  END IF;
  
  v_old_status := v_art.status;
  
  -- Check if this is an auction closure
  IF p_new_status IN ('closed', 'sold') AND v_old_status NOT IN ('closed', 'sold') THEN
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
    
    -- Update status and winner
    UPDATE art
    SET 
      status = p_new_status::art_status,
      winner_id = v_winner.id,
      updated_at = NOW()
    WHERE id = v_art.id;
    
    -- Send winner notification if there's a winner
    IF v_winner.id IS NOT NULL THEN
      v_phone := COALESCE(v_winner.auth_phone, v_winner.phone_number);
      
      IF v_phone IS NOT NULL THEN
        -- Calculate total with tax
        v_total_with_tax := v_winner.amount * (1 + COALESCE(v_art.tax, 0) / 100.0);
        
        -- Generate payment URL
        v_payment_url := format('https://artb.art/pay/%s', v_art.art_code);
        
        -- Send instant SMS to winner
        v_message_id := send_sms_instantly(
          p_destination := v_phone,
          p_message_body := format(
            'Congratulations! You won %s by %s for %s%s (incl tax). Complete payment: %s',
            v_art.art_code,
            v_art.artist_name,
            COALESCE(v_art.currency, '$'),
            round(v_total_with_tax, 2),
            v_payment_url
          ),
          p_metadata := jsonb_build_object(
            'type', 'auction_winner',
            'art_id', v_art.id,
            'art_code', v_art.art_code,
            'amount', v_winner.amount,
            'total_with_tax', round(v_total_with_tax, 2),
            'winner_id', v_winner.id,
            'closed_by', 'admin',
            'admin_phone', p_admin_phone
          )
        );
        
        v_notifications_sent := v_notifications_sent + 1;
      END IF;
      
      -- Send NOT WINNING notifications to all other bidders
      FOR v_bidder IN
        SELECT DISTINCT 
          p.id,
          p.nickname,
          COALESCE(p.auth_phone, p.phone_number) as phone,
          MAX(b.amount) as highest_bid
        FROM bids b
        JOIN people p ON b.person_id = p.id
        WHERE b.art_id = v_art.id
          AND p.id != v_winner.id  -- Exclude the winner
        GROUP BY p.id, p.nickname, p.auth_phone, p.phone_number
      LOOP
        IF v_bidder.phone IS NOT NULL THEN
          PERFORM send_sms_instantly(
            p_destination := v_bidder.phone,
            p_message_body := format(
              'NOT WINNING - %s by %s. Your highest bid: %s%s. Winner bid: %s%s',
              v_art.art_code,
              v_art.artist_name,
              COALESCE(v_art.currency, '$'),
              v_bidder.highest_bid,
              COALESCE(v_art.currency, '$'),
              v_winner.amount
            ),
            p_metadata := jsonb_build_object(
              'type', 'auction_not_winning',
              'art_id', v_art.id,
              'art_code', v_art.art_code,
              'bidder_id', v_bidder.id,
              'highest_bid', v_bidder.highest_bid,
              'winning_bid', v_winner.amount,
              'closed_by', 'admin',
              'admin_phone', p_admin_phone
            )
          );
          
          v_notifications_sent := v_notifications_sent + 1;
        END IF;
      END LOOP;
      
      RETURN jsonb_build_object(
        'success', true,
        'message', 'Auction closed successfully',
        'old_status', v_old_status,
        'new_status', p_new_status,
        'notifications_sent', v_notifications_sent,
        'winner', jsonb_build_object(
          'id', v_winner.id,
          'nickname', v_winner.nickname,
          'amount', v_winner.amount,
          'total_with_tax', round(v_total_with_tax, 2)
        )
      );
    ELSE
      -- No winner
      RETURN jsonb_build_object(
        'success', true,
        'message', 'Auction closed with no bids',
        'old_status', v_old_status,
        'new_status', p_new_status
      );
    END IF;
  ELSE
    -- Just update status
    -- IMPORTANT: Clear closing_time when reopening to active
    IF p_new_status = 'active' THEN
      UPDATE art
      SET 
        status = p_new_status::art_status,
        closing_time = NULL,  -- Clear the closing time to prevent auto-close
        updated_at = NOW()
      WHERE id = v_art.id;
      
      -- Log the reopening
      RAISE NOTICE 'Reopened bidding for % - cleared closing_time', v_art.art_code;
    ELSE
      -- For other status changes, just update status
      UPDATE art
      SET 
        status = p_new_status::art_status,
        updated_at = NOW()
      WHERE id = v_art.id;
    END IF;
    
    RETURN jsonb_build_object(
      'success', true,
      'message', CASE 
        WHEN p_new_status = 'active' AND v_old_status != 'active' THEN 'Bidding reopened successfully - timer cleared'
        ELSE 'Status updated successfully'
      END,
      'old_status', v_old_status,
      'new_status', p_new_status,
      'closing_time_cleared', p_new_status = 'active'
    );
  END IF;
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'An error occurred',
      'detail', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;