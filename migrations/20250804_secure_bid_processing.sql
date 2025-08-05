-- Secure bid processing using authenticated user

-- 1. Add auth_user_id to people table to link with Supabase auth
ALTER TABLE people 
ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS auth_phone TEXT;

-- Create index for auth lookups
CREATE INDEX IF NOT EXISTS idx_people_auth_user_id ON people(auth_user_id);

-- 2. Create secure process_bid function that uses auth context
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
  
  -- Get user's phone from auth metadata
  SELECT 
    raw_user_meta_data->>'phone' as phone,
    raw_user_meta_data
  INTO v_auth_phone, v_auth_metadata
  FROM auth.users
  WHERE id = v_auth_user_id;
  
  IF v_auth_phone IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Phone number required for bidding'
    );
  END IF;
  
  -- Extract nickname from metadata
  v_nickname := COALESCE(
    v_auth_metadata->>'nickname',
    v_auth_metadata->>'name',
    SPLIT_PART(v_auth_metadata->>'email', '@', 1)
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
  ELSE
    -- Update existing person record with latest phone
    UPDATE people
    SET 
      auth_phone = v_auth_phone,
      phone_number = COALESCE(phone_number, v_auth_phone),
      nickname = COALESCE(nickname, v_nickname),
      updated_at = NOW()
    WHERE id = v_person_id;
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

-- 3. Create secure vote function
CREATE OR REPLACE FUNCTION cast_vote_secure(
  p_art_id TEXT
) RETURNS JSONB AS $$
DECLARE
  v_auth_user_id UUID;
  v_person_id UUID;
  v_art_uuid UUID;
  v_event_id UUID;
  v_existing_vote_id UUID;
BEGIN
  -- Get authenticated user
  v_auth_user_id := auth.uid();
  
  IF v_auth_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Authentication required'
    );
  END IF;
  
  -- Get person record
  SELECT id INTO v_person_id
  FROM people
  WHERE auth_user_id = v_auth_user_id;
  
  IF v_person_id IS NULL THEN
    -- Create minimal person record for voting
    v_person_id := gen_random_uuid();
    
    INSERT INTO people (
      id,
      auth_user_id,
      created_at,
      updated_at
    ) VALUES (
      v_person_id,
      v_auth_user_id,
      NOW(),
      NOW()
    );
  END IF;
  
  -- Convert art code to UUID
  v_art_uuid := uuid_generate_v5(uuid_ns_oid(), p_art_id);
  
  -- Get event and check if exists
  SELECT event_id INTO v_event_id
  FROM art
  WHERE id = v_art_uuid;
  
  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Artwork not found'
    );
  END IF;
  
  -- Check for existing vote
  SELECT id INTO v_existing_vote_id
  FROM votes
  WHERE art_id = v_art_uuid
    AND person_id = v_person_id;
    
  IF v_existing_vote_id IS NOT NULL THEN
    -- Remove existing vote
    DELETE FROM votes
    WHERE id = v_existing_vote_id;
    
    -- Update vote count
    UPDATE art
    SET vote_count = GREATEST(0, vote_count - 1)
    WHERE id = v_art_uuid;
    
    RETURN jsonb_build_object(
      'success', true,
      'action', 'unvoted'
    );
  ELSE
    -- Add new vote
    INSERT INTO votes (
      id,
      art_id,
      person_id,
      event_id,
      created_at
    ) VALUES (
      gen_random_uuid(),
      v_art_uuid,
      v_person_id,
      v_event_id,
      NOW()
    );
    
    -- Update vote count
    UPDATE art
    SET vote_count = vote_count + 1
    WHERE id = v_art_uuid;
    
    RETURN jsonb_build_object(
      'success', true,
      'action', 'voted'
    );
  END IF;
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'An error occurred processing your vote',
      'detail', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Grant permissions
GRANT EXECUTE ON FUNCTION process_bid_secure(TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION cast_vote_secure(TEXT) TO authenticated;

-- 5. Create RLS policies for people table
ALTER TABLE people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" ON people
  FOR SELECT USING (auth_user_id = auth.uid());

CREATE POLICY "Users can update their own profile" ON people
  FOR UPDATE USING (auth_user_id = auth.uid());

-- 6. Create migration function to link existing users
CREATE OR REPLACE FUNCTION migrate_auth_phone_numbers()
RETURNS void AS $$
BEGIN
  -- Update people records with auth phone numbers where possible
  UPDATE people p
  SET 
    auth_user_id = u.id,
    auth_phone = u.raw_user_meta_data->>'phone'
  FROM auth.users u
  WHERE u.raw_user_meta_data->>'phone' = p.phone_number
    AND p.auth_user_id IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Run migration
SELECT migrate_auth_phone_numbers();