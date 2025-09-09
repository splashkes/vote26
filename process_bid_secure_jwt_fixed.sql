-- Restore working process_bid_secure function with JWT compatibility
-- Based on commit f6a3072 (working version) with JWT changes from cast_vote_secure

CREATE OR REPLACE FUNCTION public.process_bid_secure(p_art_id text, p_amount numeric)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $function$
DECLARE
  v_auth_user_id UUID;
  v_auth_phone TEXT;
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
  v_currency_code TEXT;
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

  -- Get user phone from auth.users table
  SELECT phone INTO v_auth_phone
  FROM auth.users
  WHERE id = v_auth_user_id;

  IF v_auth_phone IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Phone number required for bidding. Please update your profile.',
      'auth_user_id', v_auth_user_id
    );
  END IF;

  -- Extract nickname from app_meta_data for display (optional)
  SELECT
    COALESCE(
      raw_app_meta_data->>'nickname',
      raw_app_meta_data->>'name',
      SPLIT_PART(raw_app_meta_data->>'email', '@', 1)
    ) INTO v_nickname
  FROM auth.users
  WHERE id = v_auth_user_id;

  -- Get person record - AUTH-FIRST APPROACH (no metadata needed)
  SELECT id INTO v_person_id
  FROM people
  WHERE auth_user_id = v_auth_user_id;

  IF v_person_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User profile not found - please complete phone verification',
      'auth_user_id', v_auth_user_id,
      'auth_phone', v_auth_phone
    );
  END IF;

  -- Extract event number from art code
  v_event_number := SPLIT_PART(p_art_id, '-', 1);

  -- Get art record using art_code with currency information from countries (ORIGINAL WORKING QUERY)
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
    COALESCE(co.currency_symbol, '$'),
    COALESCE(co.currency_code, 'USD')
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
    v_currency_symbol,
    v_currency_code
  FROM art a
  JOIN events e ON a.event_id = e.id
  JOIN cities c ON e.city_id = c.id
  JOIN countries co ON c.country_id = co.id
  LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
  WHERE a.art_code = p_art_id;

  -- Check if art exists
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unable to find the matching Art'
    );
  END IF;

  -- Check if auction is enabled (ORIGINAL WORKING LOGIC)
  IF v_art_status <> 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Auction disabled'
    );
  END IF;

  -- Determine minimum bid
  IF v_current_bid IS NULL OR v_current_bid = 0 THEN
    IF p_amount < v_auction_start_bid THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Bid must be at least ' || v_currency_symbol || v_auction_start_bid
      );
    END IF;
  ELSE
    IF p_amount <= v_current_bid THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Bid must be higher than current bid of ' || v_currency_symbol || v_current_bid
      );
    END IF;

    IF (p_amount - v_current_bid) < v_min_increment THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Bid increment must be at least ' || v_currency_symbol || v_min_increment
      );
    END IF;
  END IF;

  -- Get previous bidder info for notifications
  SELECT
    person_id,
    person_mongo_id
  INTO
    v_previous_bidder_id,
    v_previous_bidder_mongo_id
  FROM bids
  WHERE art_uuid = v_art_uuid
    AND amount = v_current_bid
  ORDER BY created_at DESC
  LIMIT 1;

  -- Process the bid
  v_bid_id := gen_random_uuid();

  INSERT INTO bids (
    id,
    event_id,
    round,
    easel,
    art_id,
    art_uuid,
    person_id,
    amount,
    person_mongo_id,
    created_at
  ) VALUES (
    v_bid_id,
    v_event_id,
    v_round,
    v_easel,
    p_art_id,
    v_art_uuid,
    v_person_id,
    p_amount,
    NULL, -- No mongo compatibility needed
    NOW()
  );

  -- Update artwork current bid
  UPDATE art
  SET
    current_bid = p_amount,
    updated_at = NOW()
  WHERE id = v_art_uuid;

  -- Check if bid extends auction time
  SELECT check_and_extend_auction(v_art_uuid) INTO v_extension_result;

  -- Queue bid notification (fire-and-forget)
  PERFORM queue_bid_notification(
    v_bid_id,
    v_person_id,
    v_art_uuid,
    p_amount,
    v_previous_bidder_id
  );

  -- Return success response
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Bid placed successfully',
    'bid_id', v_bid_id,
    'amount', p_amount,
    'art_id', p_art_id,
    'previous_bid', v_current_bid,
    'bidder_name', COALESCE(v_nickname, 'Anonymous'),
    'artist_name', v_artist_name,
    'currency_code', v_currency_code,
    'currency_symbol', v_currency_symbol
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
$function$;