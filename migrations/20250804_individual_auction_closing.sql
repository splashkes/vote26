-- Individual auction closing times with automatic 5-minute extensions

-- 1. Add closing_time to art table
ALTER TABLE art 
ADD COLUMN IF NOT EXISTS closing_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS auction_extended BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS extension_count INTEGER DEFAULT 0;

-- 2. Initialize closing times for existing artworks based on event closing time
UPDATE art a
SET closing_time = e.auction_close_starts_at
FROM events e
WHERE a.event_id = e.id
  AND a.closing_time IS NULL
  AND e.auction_close_starts_at IS NOT NULL;

-- 3. Create function to handle auction time extensions
CREATE OR REPLACE FUNCTION handle_auction_extension(
  p_art_id UUID,
  p_bid_time TIMESTAMPTZ DEFAULT NOW()
) RETURNS JSONB AS $$
DECLARE
  v_current_closing TIMESTAMPTZ;
  v_time_remaining INTERVAL;
  v_new_closing TIMESTAMPTZ;
  v_extended BOOLEAN := false;
  v_event_id UUID;
  v_channel_id VARCHAR;
BEGIN
  -- Get current closing time
  SELECT closing_time, event_id 
  INTO v_current_closing, v_event_id
  FROM art 
  WHERE id = p_art_id;
  
  -- If no closing time set, nothing to extend
  IF v_current_closing IS NULL THEN
    RETURN jsonb_build_object('extended', false, 'reason', 'No closing time set');
  END IF;
  
  -- Calculate time remaining
  v_time_remaining := v_current_closing - p_bid_time;
  
  -- If bid is within 5 minutes of closing, extend by 5 minutes
  IF v_time_remaining > INTERVAL '0 seconds' AND v_time_remaining <= INTERVAL '5 minutes' THEN
    v_new_closing := p_bid_time + INTERVAL '5 minutes';
    
    -- Update the art record
    UPDATE art 
    SET 
      closing_time = v_new_closing,
      auction_extended = true,
      extension_count = extension_count + 1,
      updated_at = NOW()
    WHERE id = p_art_id;
    
    v_extended := true;
    
    -- Queue Slack notification for extension
    SELECT resolve_slack_channel(COALESCE(es.channel_name, es.channel_id))
    INTO v_channel_id
    FROM event_slack_settings es
    WHERE es.event_id = v_event_id;
    
    IF v_channel_id IS NOT NULL THEN
      INSERT INTO slack_notifications (
        event_id,
        channel_id,
        message_type,
        payload
      ) VALUES (
        v_event_id,
        v_channel_id,
        'auction_extended',
        jsonb_build_object(
          'art_id', p_art_id,
          'old_closing', v_current_closing,
          'new_closing', v_new_closing,
          'extension_number', (SELECT extension_count FROM art WHERE id = p_art_id),
          'time_zone', current_setting('TIMEZONE')
        )
      );
    END IF;
  END IF;
  
  RETURN jsonb_build_object(
    'extended', v_extended,
    'old_closing', v_current_closing,
    'new_closing', CASE WHEN v_extended THEN v_new_closing ELSE v_current_closing END,
    'time_remaining', EXTRACT(EPOCH FROM v_time_remaining)
  );
END;
$$ LANGUAGE plpgsql;

-- 4. Update process_bid to automatically extend auctions
CREATE OR REPLACE FUNCTION process_bid(
  p_art_id TEXT,
  p_user_id TEXT,
  p_user_data JSONB,
  p_amount NUMERIC,
  p_ip_address TEXT
) RETURNS JSONB AS $$
DECLARE
  v_event_id UUID;
  v_art_uuid UUID;
  v_person_id UUID;
  v_current_bid DECIMAL;
  v_min_increment DECIMAL;
  v_auction_start_bid DECIMAL;
  v_previous_bidder_id UUID;
  v_previous_bidder_mongo_id TEXT;
  v_bid_id UUID;
  v_art_status TEXT;
  v_event_mongo_id TEXT;
  v_artist_name TEXT;
  v_phone_number TEXT;
  v_event_phone_number TEXT;
  v_currency_symbol TEXT;
  v_round INT;
  v_easel INT;
  v_extension_result JSONB;
BEGIN
  -- Convert art code to UUID
  v_art_uuid := uuid_generate_v5(uuid_ns_oid(), p_art_id);
  
  -- Get or create person
  v_person_id := uuid_generate_v5(uuid_ns_oid(), p_user_id);
  
  -- Ensure person exists
  INSERT INTO people (id, mongo_id, nickname, phone_number, phone_number_masked)
  VALUES (
    v_person_id,
    p_user_id,
    p_user_data->>'NickName',
    p_user_data->>'PhoneNumber',
    p_user_data->>'PhoneNumber'
  )
  ON CONFLICT (id) DO UPDATE
  SET nickname = EXCLUDED.nickname,
      phone_number = EXCLUDED.phone_number;
  
  -- Lock and get art record with event phone number
  SELECT
    a.event_id,
    a.status::text,
    a.current_bid,
    a.round,
    a.easel,
    COALESCE(p.nickname, p.name, 'Artist'),
    e.event_code,
    e.min_bid_increment,
    e.auction_start_bid,
    e.phone_number,
    COALESCE(e.currency, '$')
  INTO
    v_event_id,
    v_art_status,
    v_current_bid,
    v_round,
    v_easel,
    v_artist_name,
    v_event_mongo_id,
    v_min_increment,
    v_auction_start_bid,
    v_event_phone_number,
    v_currency_symbol
  FROM art a
  JOIN events e ON a.event_id = e.id
  LEFT JOIN people p ON a.artist_id = p.id
  WHERE a.id = v_art_uuid
  FOR UPDATE OF a;
  
  -- Check if art exists
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unable to find the matching Art'
    );
  END IF;
  
  -- Check if auction is enabled
  IF v_art_status != 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Auction disabled'
    );
  END IF;
  
  -- Check if auction has closed
  PERFORM 1 FROM art 
  WHERE id = v_art_uuid 
    AND closing_time IS NOT NULL 
    AND closing_time < NOW();
    
  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Auction has ended for this artwork'
    );
  END IF;
  
  -- Determine minimum bid
  DECLARE
    v_minimum_bid DECIMAL;
  BEGIN
    IF v_current_bid IS NULL OR v_current_bid = 0 THEN
      v_minimum_bid := v_auction_start_bid;
    ELSE
      v_minimum_bid := v_current_bid + v_min_increment;
    END IF;
    
    -- Validate bid amount
    IF p_amount < v_minimum_bid THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Bid increment is %s%s', COALESCE(v_currency_symbol, '$'), v_min_increment)
      );
    END IF;
  END;
  
  -- Get previous highest bidder for outbid notification
  SELECT b.person_id, p.mongo_id
  INTO v_previous_bidder_id, v_previous_bidder_mongo_id
  FROM bids b
  JOIN people p ON b.person_id = p.id
  WHERE b.art_id = v_art_uuid
  ORDER BY b.amount DESC
  LIMIT 1;
  
  -- Insert new bid
  v_bid_id := gen_random_uuid();
  INSERT INTO bids (id, art_id, person_id, amount, ip_address, created_at)
  VALUES (v_bid_id, v_art_uuid, v_person_id, p_amount, p_ip_address::inet, NOW());
  
  -- Update art record
  UPDATE art
  SET
    current_bid = p_amount,
    bid_count = bid_count + 1,
    updated_at = NOW()
  WHERE id = v_art_uuid;
  
  -- Handle auction time extension
  v_extension_result := handle_auction_extension(v_art_uuid, NOW());
  
  -- Queue notifications with event phone number
  -- 1. Outbid notification for previous bidder
  IF v_previous_bidder_id IS NOT NULL AND v_previous_bidder_id != v_person_id THEN
    BEGIN
      -- Extract last 4 digits of phone for notification
      DECLARE
        v_phone_last4 TEXT;
      BEGIN
        v_phone_last4 := RIGHT(p_user_data->>'PhoneNumber', 4);
        
        PERFORM queue_outbid_notification(
          v_previous_bidder_mongo_id,
          v_previous_bidder_id,
          p_art_id,
          v_artist_name,
          p_amount,
          v_currency_symbol,
          v_phone_last4,
          v_event_phone_number
        );
      END;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Failed to queue outbid notification: %', SQLERRM;
    END;
  END IF;
  
  -- 2. Bid confirmation for current bidder
  BEGIN
    PERFORM queue_bid_confirmation(
      p_user_id,
      v_person_id,
      p_art_id,
      v_artist_name,
      p_amount,
      v_currency_symbol,
      p_user_data,
      v_event_phone_number
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Failed to queue bid confirmation: %', SQLERRM;
  END;
  
  -- Return success with event ID and extension info
  RETURN jsonb_build_object(
    'success', true,
    'bid_id', v_bid_id,
    'event_id', v_event_mongo_id,
    'message', 'ok',
    'auction_extended', v_extension_result->'extended',
    'new_closing_time', v_extension_result->'new_closing'
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log the actual error for debugging
    RAISE WARNING 'Error in process_bid: %', SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'An error occurred processing your bid',
      'detail', SQLERRM
    );
END;
$$ LANGUAGE plpgsql;

-- 5. Add auction_extended message format to Slack formatting
CREATE OR REPLACE FUNCTION format_slack_message(
  p_type VARCHAR,
  p_payload JSONB
) RETURNS JSONB AS $$
BEGIN
  -- Keep all existing CASE statements and add:
  CASE p_type
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

-- 6. Function to check and close expired auctions
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
  v_channel_id VARCHAR;
BEGIN
  -- Find all artworks that should be closed
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
    
    -- Queue winner SMS notification
    IF v_winner.phone_number IS NOT NULL THEN
      INSERT INTO message_queue (
        channel,
        destination,
        message_body,
        metadata,
        status,
        priority,
        send_after
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
        NOW()
      );
      
      v_notifications := v_notifications + 1;
    END IF;
    
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
          'artist_name', COALESCE(v_art.artist_name, 'Artist'),
          'final_bid', v_winner.amount,
          'winner_name', v_winner.nickname,
          'winner_phone', RIGHT(v_winner.phone_number, 4),
          'total_bids', v_art.bid_count
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

-- 7. Create cron job to check for expired auctions
-- First check if job exists, then insert or update
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-expired-auctions') THEN
    UPDATE cron.job 
    SET schedule = '* * * * *',
        command = 'SELECT check_and_close_expired_auctions();'
    WHERE jobname = 'check-expired-auctions';
  ELSE
    INSERT INTO cron.job (jobname, schedule, command)
    VALUES ('check-expired-auctions', '* * * * *', 'SELECT check_and_close_expired_auctions();');
  END IF;
END $$;

-- 8. Function to set auction closing times for an event
CREATE OR REPLACE FUNCTION set_event_auction_closing_times(
  p_event_id UUID,
  p_closing_time TIMESTAMPTZ
) RETURNS INTEGER AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE art
  SET 
    closing_time = p_closing_time,
    updated_at = NOW()
  WHERE event_id = p_event_id
    AND status = 'active';
    
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  
  RETURN v_updated;
END;
$$ LANGUAGE plpgsql;

-- 9. Grant permissions
GRANT EXECUTE ON FUNCTION handle_auction_extension(UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION check_and_close_expired_auctions() TO authenticated;
GRANT EXECUTE ON FUNCTION set_event_auction_closing_times(UUID, TIMESTAMPTZ) TO authenticated;