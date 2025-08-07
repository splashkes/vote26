-- Fix admin_update_art_status to use the correct send_sms_instantly signature
CREATE OR REPLACE FUNCTION admin_update_art_status(
  p_art_code TEXT,
  p_new_status TEXT,
  p_admin_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Get art details (using correct id field)
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
    -- Get highest bidder (using correct art.id field)
    SELECT 
      b.person_id as id,
      b.amount,
      p.phone_number,
      p.auth_phone,
      p.nickname
    INTO v_winner
    FROM bids b
    JOIN people p ON b.person_id = p.id
    WHERE b.art_id = v_art.id  -- art.id is the UUID
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
        
        -- Send instant SMS to winner - use the 4-parameter version
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
          ),
          p_from_phone := NULL  -- Explicitly pass the 4th parameter
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
        WHERE b.art_id = v_art.id  -- art.id is the UUID
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
            ),
            p_from_phone := NULL  -- Explicitly pass the 4th parameter
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
          'total_with_tax', round(v_total_with_tax, 2),
          'sms_sent', v_phone IS NOT NULL
        )
      );
    ELSE
      -- No winner
      UPDATE art 
      SET 
        status = p_new_status::art_status,
        updated_at = NOW()
      WHERE id = v_art.id;
      
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
$$;

-- Fix the manage_auction_timer function with correct WHERE clause
CREATE OR REPLACE FUNCTION manage_auction_timer(
  p_art_code TEXT,
  p_action TEXT,
  p_timer_minutes INTEGER DEFAULT 12
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_art RECORD;
  v_closing_time TIMESTAMPTZ;
  v_timer_seconds INTEGER;
BEGIN
  -- Validate action
  IF p_action NOT IN ('start', 'stop', 'check') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid action. Must be start, stop, or check'
    );
  END IF;

  -- Get art details using art_code (not id!)
  SELECT * INTO v_art
  FROM art
  WHERE art_code = p_art_code;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Art not found'
    );
  END IF;

  -- Handle different actions
  CASE p_action
    WHEN 'start' THEN
      -- Check if already has an active timer
      IF v_art.closing_time IS NOT NULL AND v_art.closing_time > NOW() THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Timer already active',
          'closing_time', v_art.closing_time,
          'seconds_remaining', EXTRACT(EPOCH FROM (v_art.closing_time - NOW()))::INTEGER
        );
      END IF;

      -- Check if auction is active
      IF v_art.status != 'active' THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', format('Cannot start timer - auction status is %s', v_art.status)
        );
      END IF;

      -- Calculate closing time
      v_timer_seconds := p_timer_minutes * 60;
      v_closing_time := NOW() + (v_timer_seconds || ' seconds')::INTERVAL;

      -- Update the art with closing time - use art_code in WHERE clause!
      UPDATE art
      SET 
        closing_time = v_closing_time,
        updated_at = NOW()
      WHERE art_code = p_art_code;  -- Fixed: use art_code not id

      RETURN jsonb_build_object(
        'success', true,
        'message', format('%s minute timer started', p_timer_minutes),
        'closing_time', v_closing_time,
        'seconds_remaining', v_timer_seconds
      );

    WHEN 'stop' THEN
      -- Clear the timer - use art_code in WHERE clause!
      UPDATE art
      SET 
        closing_time = NULL,
        updated_at = NOW()
      WHERE art_code = p_art_code;  -- Fixed: use art_code not id

      RETURN jsonb_build_object(
        'success', true,
        'message', 'Timer stopped'
      );

    WHEN 'check' THEN
      -- Return current timer status
      IF v_art.closing_time IS NULL THEN
        RETURN jsonb_build_object(
          'success', true,
          'has_timer', false,
          'message', 'No timer active'
        );
      ELSIF v_art.closing_time <= NOW() THEN
        RETURN jsonb_build_object(
          'success', true,
          'has_timer', true,
          'expired', true,
          'closing_time', v_art.closing_time,
          'message', 'Timer has expired'
        );
      ELSE
        RETURN jsonb_build_object(
          'success', true,
          'has_timer', true,
          'expired', false,
          'closing_time', v_art.closing_time,
          'seconds_remaining', EXTRACT(EPOCH FROM (v_art.closing_time - NOW()))::INTEGER,
          'message', 'Timer is active'
        );
      END IF;
  END CASE;

EXCEPTION 
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'An error occurred',
      'detail', SQLERRM
    );
END;
$$;