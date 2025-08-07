-- Fix admin_update_art_status to clear closing_time when reopening bidding

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
        
        -- Send instant SMS
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

-- Also create a dedicated function to clear closing times for manual intervention
CREATE OR REPLACE FUNCTION clear_auction_closing_time(p_art_code TEXT)
RETURNS JSONB AS $$
DECLARE
  v_rows_updated INT;
BEGIN
  UPDATE art
  SET closing_time = NULL
  WHERE art_code = p_art_code
    AND status = 'active'::art_status;
  
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  
  IF v_rows_updated > 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', format('Cleared closing time for %s', p_art_code)
    );
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Art not found or not active'
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION clear_auction_closing_time TO authenticated;