-- Add more detailed logging to process_bid_secure to debug auth context

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
  v_event_number TEXT;
  v_artist_name TEXT;
  v_currency_symbol TEXT;
  v_round INT;
  v_easel INT;
  v_extension_result JSONB;
  v_nickname TEXT;
  v_debug_info JSONB;
BEGIN
  -- Get authenticated user
  v_auth_user_id := auth.uid();
  
  -- Create debug info
  v_debug_info := jsonb_build_object(
    'auth_uid', v_auth_user_id,
    'auth_jwt', current_setting('request.jwt.claims', true),
    'auth_role', current_setting('request.jwt.claim.role', true)
  );
  
  RAISE WARNING 'Debug auth context: %', v_debug_info;
  
  IF v_auth_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Authentication required',
      'debug', v_debug_info
    );
  END IF;
  
  -- Get user's phone from auth.users table
  SELECT 
    phone,
    raw_user_meta_data
  INTO v_auth_phone, v_auth_metadata
  FROM auth.users
  WHERE id = v_auth_user_id;
  
  -- Log for debugging
  RAISE WARNING 'Auth user ID: %, Phone: %, Metadata: %', v_auth_user_id, v_auth_phone, v_auth_metadata;
  
  IF v_auth_phone IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Phone number required for bidding. Please update your profile.',
      'auth_user_id', v_auth_user_id
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
    
    RAISE WARNING 'Created new person record: % for auth_user: %', v_person_id, v_auth_user_id;
  ELSE
    -- Update existing person record with latest phone
    UPDATE people
    SET 
      auth_phone = v_auth_phone,
      phone_number = COALESCE(phone_number, v_auth_phone),
      nickname = COALESCE(nickname, v_nickname),
      updated_at = NOW()
    WHERE id = v_person_id;
    
    RAISE WARNING 'Updated existing person record: % for auth_user: %', v_person_id, v_auth_user_id;
  END IF;
  
  -- Extract event number from art code (e.g., AB3032 from AB3032-1-2)
  v_event_number := SPLIT_PART(p_art_id, '-', 1);
  
  -- Lock and get art record using art_code
  SELECT
    a.id,
    a.event_id,
    a.status::text,
    a.current_bid,
    a.round,
    a.easel,
    COALESCE(ap.name, 'Artist'),
    e.min_bid_increment,
    e.auction_start_bid,
    COALESCE(e.currency, '$')
  INTO
    v_art_uuid,
    v_event_id,
    v_art_status,
    v_current_bid,
    v_round,
    v_easel,
    v_artist_name,
    v_min_increment,
    v_auction_start_bid,
    v_currency_symbol
  FROM art a
  JOIN events e ON a.event_id = e.id
  LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
  WHERE a.art_code = p_art_id
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
    RAISE WARNING 'Queueing bid confirmation for phone: %, person_id: %', v_auth_phone, v_person_id;
    
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
    'event_id', v_event_number,
    'message', 'Bid placed successfully',
    'auction_extended', v_extension_result->'extended',
    'new_closing_time', v_extension_result->'new_closing',
    'debug_auth', v_auth_user_id
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