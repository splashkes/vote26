-- Debug version of admin_update_art_status to find the issue

CREATE OR REPLACE FUNCTION admin_update_art_status(
  p_art_code TEXT,
  p_new_status TEXT,
  p_admin_phone TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_art RECORD;
  v_old_status TEXT;
  v_winner RECORD;
  v_message_id UUID;
  v_phone TEXT;
  v_total_with_tax NUMERIC;
  v_payment_url TEXT;
  v_event RECORD;
BEGIN
  -- Validate new status
  IF p_new_status NOT IN ('active', 'closed', 'sold', 'inactive') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid status. Must be active, closed, sold, or inactive'
    );
  END IF;
  
  BEGIN
    -- Get art details with separate query to avoid FOR UPDATE issue
    SELECT 
      a.id,
      a.art_code,
      a.status,
      a.event_id,
      a.artist_id,
      a.current_bid,
      a.starting_bid
    INTO v_art
    FROM art a
    WHERE a.art_code = p_art_code;
    
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Art not found');
    END IF;
    
    -- Get event details separately
    SELECT 
      e.name as event_name,
      e.currency,
      e.tax,
      COALESCE(ap.name, 'Artist') as artist_name
    INTO v_event
    FROM events e
    LEFT JOIN artist_profiles ap ON ap.id = v_art.artist_id
    WHERE e.id = v_art.event_id;
    
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
          v_total_with_tax := v_winner.amount * (1 + COALESCE(v_event.tax, 0) / 100.0);
          
          -- Generate payment URL
          v_payment_url := format('https://artb.art/pay/%s', v_art.art_code);
          
          -- Send instant SMS
          v_message_id := send_sms_instantly(
            p_destination := v_phone,
            p_message_body := format(
              'Congratulations! You won %s by %s for %s%s (incl tax). Complete payment: %s',
              v_art.art_code,
              v_event.artist_name,
              COALESCE(v_event.currency, '$'),
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
        END IF;
        
        RETURN jsonb_build_object(
          'success', true,
          'message', 'Auction closed successfully',
          'old_status', v_old_status,
          'new_status', p_new_status,
          'winner', jsonb_build_object(
            'id', v_winner.id,
            'nickname', v_winner.nickname,
            'amount', v_winner.amount,
            'total_with_tax', round(v_total_with_tax, 2),
            'sms_sent', v_message_id IS NOT NULL
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
      UPDATE art
      SET 
        status = p_new_status::art_status,
        updated_at = NOW()
      WHERE id = v_art.id;
      
      RETURN jsonb_build_object(
        'success', true,
        'message', 'Status updated successfully',
        'old_status', v_old_status,
        'new_status', p_new_status
      );
    END IF;
    
  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'An error occurred',
        'detail', SQLERRM,
        'error_detail', SQLSTATE
      );
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Test it
SELECT admin_update_art_status('AB3032-3-2', 'closed');