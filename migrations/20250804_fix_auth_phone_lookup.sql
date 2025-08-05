-- Fix process_bid_secure to use phone column from auth.users

CREATE OR REPLACE FUNCTION process_bid_secure(
  p_art_id TEXT,
  p_amount NUMERIC
) RETURNS JSONB AS $$
DECLARE
  v_auth_user_id UUID;
  v_auth_phone TEXT;
  v_auth_metadata JSONB;
  v_person_id UUID;
  v_event_id UUID;
  v_art_uuid UUID;
  v_current_bid DECIMAL;
  v_min_increment DECIMAL;
  v_auction_start_bid DECIMAL;
  v_previous_bidder_id UUID;
  v_previous_bidder_mongo_id TEXT;
  v_bid_id UUID;
  v_art_status TEXT;
  v_event_mongo_id TEXT;
  v_artist_name TEXT;
  v_currency_symbol TEXT;
  v_round INT;
  v_easel INT;
  v_extension_result JSONB;
  v_nickname TEXT;
BEGIN
  -- Get authenticated user
  v_auth_user_id := auth.uid();
  
  IF v_auth_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Authentication required'
    );
  END IF;
  
  -- Get user's phone from auth.users table (not metadata)
  SELECT 
    phone,
    raw_user_meta_data
  INTO v_auth_phone, v_auth_metadata
  FROM auth.users
  WHERE id = v_auth_user_id;
  
  -- Log for debugging
  RAISE NOTICE 'Auth user ID: %, Phone: %', v_auth_user_id, v_auth_phone;
  
  IF v_auth_phone IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Phone number required for bidding. Please update your profile.'
    );
  END IF;
  
  -- Extract nickname from metadata or email
  v_nickname := COALESCE(
    v_auth_metadata->>'nickname',
    v_auth_metadata->>'name',
    v_auth_metadata->>'full_name',
    SPLIT_PART(v_auth_metadata->>'email', '@', 1),
    'User'
  );
  
  -- Get or create person record linked to auth user
  SELECT id INTO v_person_id
  FROM people
  WHERE auth_user_id = v_auth_user_id;
  
  IF v_person_id IS NULL THEN
    -- Create new person record
    v_person_id := gen_random_uuid();
    
    INSERT INTO people (
      id,
      auth_user_id,
      auth_phone,
      phone_number,
      nickname,
      created_at,
      updated_at
    ) VALUES (
      v_person_id,
      v_auth_user_id,
      v_auth_phone,
      v_auth_phone,
      v_nickname,
      NOW(),
      NOW()
    );
    
    RAISE NOTICE 'Created new person record: %', v_person_id;
  ELSE
    -- Update existing person record with latest phone
    UPDATE people
    SET 
      auth_phone = v_auth_phone,
      phone_number = COALESCE(phone_number, v_auth_phone),
      nickname = COALESCE(nickname, v_nickname),
      updated_at = NOW()
    WHERE id = v_person_id;
    
    RAISE NOTICE 'Updated existing person record: %', v_person_id;
  END IF;
  
  -- Convert art code to UUID
  v_art_uuid := uuid_generate_v5(uuid_ns_oid(), p_art_id);
  
  -- Lock and get art record
  SELECT
    a.event_id,
    a.status::text,
    a.current_bid,
    a.round,
    a.easel,
    COALESCE(ap.name, 'Artist'),
    e.event_code,
    e.min_bid_increment,
    e.auction_start_bid,
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
    v_currency_symbol
  FROM art a
  JOIN events e ON a.event_id = e.id
  LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
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
        'error', format('Minimum bid is %s%s', v_currency_symbol, v_minimum_bid)
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
  INSERT INTO bids (id, art_id, person_id, amount, created_at)
  VALUES (v_bid_id, v_art_uuid, v_person_id, p_amount, NOW());
  
  -- Update art record
  UPDATE art
  SET
    current_bid = p_amount,
    bid_count = bid_count + 1,
    updated_at = NOW()
  WHERE id = v_art_uuid;
  
  -- Handle auction time extension
  v_extension_result := handle_auction_extension(v_art_uuid, NOW());
  
  -- Queue notifications
  -- 1. Outbid notification for previous bidder (if different person)
  IF v_previous_bidder_id IS NOT NULL AND v_previous_bidder_id != v_person_id THEN
    BEGIN
      DECLARE
        v_phone_last4 TEXT;
      BEGIN
        v_phone_last4 := RIGHT(v_auth_phone, 4);
        
        PERFORM queue_outbid_notification(
          COALESCE(v_previous_bidder_mongo_id, v_previous_bidder_id::text),
          v_previous_bidder_id,
          p_art_id,
          v_artist_name,
          p_amount,
          v_currency_symbol,
          v_phone_last4
        );
      END;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Failed to queue outbid notification: %', SQLERRM;
    END;
  END IF;
  
  -- 2. Bid confirmation for current bidder
  BEGIN
    RAISE NOTICE 'Queueing bid confirmation for phone: %', v_auth_phone;
    
    PERFORM queue_bid_confirmation(
      v_auth_user_id::text,
      v_person_id,
      p_art_id,
      v_artist_name,
      p_amount,
      v_currency_symbol,
      jsonb_build_object(
        'PhoneNumber', v_auth_phone,
        'NickName', v_nickname,
        'Hash', encode(digest(v_auth_user_id::text || p_art_id, 'sha256'), 'hex')
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Failed to queue bid confirmation: %', SQLERRM;
  END;
  
  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'bid_id', v_bid_id,
    'event_id', v_event_mongo_id,
    'message', 'Bid placed successfully',
    'auction_extended', v_extension_result->'extended',
    'new_closing_time', v_extension_result->'new_closing'
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in process_bid_secure: %', SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'An error occurred processing your bid',
      'detail', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also add debug logging to queue_bid_confirmation
CREATE OR REPLACE FUNCTION queue_bid_confirmation(
  p_user_mongo_id TEXT,
  p_person_id UUID,
  p_art_id TEXT,
  p_artist_name TEXT,
  p_amount NUMERIC,
  p_currency_symbol TEXT,
  p_user_data JSONB,
  p_event_phone_number TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_phone TEXT;
  v_nickname TEXT;
  v_hash TEXT;
  v_vote_url TEXT;
  v_message TEXT;
  v_message_id UUID;
BEGIN
  -- Extract user data
  v_phone := p_user_data->>'PhoneNumber';
  v_nickname := p_user_data->>'NickName';
  v_hash := p_user_data->>'Hash';
  
  RAISE NOTICE 'queue_bid_confirmation - Phone: %, Nickname: %', v_phone, v_nickname;
  
  IF v_phone IS NULL THEN
    RAISE WARNING 'No phone number provided in user_data';
    RETURN NULL;
  END IF;
  
  -- Construct personalized URL
  v_vote_url := format('%s/a/%s/r/%s',
    COALESCE(current_setting('app.site_url', true), 'https://artb.art'),
    p_art_id,
    v_hash
  );
  
  -- Format message
  v_message := format('%s%s Bid recorded on %s by %s %s',
    p_currency_symbol,
    p_amount,
    p_art_id || '-' || p_artist_name,
    v_nickname,
    v_vote_url
  );
  
  RAISE NOTICE 'Sending SMS to % with message: %', v_phone, v_message;
  
  -- Send instantly
  v_message_id := send_sms_instantly(
    p_destination := v_phone,
    p_message_body := v_message,
    p_metadata := jsonb_build_object(
      'type', 'bid_confirmation',
      'art_id', p_art_id,
      'user_id', p_user_mongo_id,
      'amount', p_amount,
      'nickname', v_nickname
    )
  );
  
  RAISE NOTICE 'SMS queued with ID: %', v_message_id;
  
  RETURN v_message_id;
END;
$$ LANGUAGE plpgsql;