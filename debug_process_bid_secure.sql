-- Add detailed debug information to process_bid_secure function
-- Following the EDGE_FUNCTION_DEBUGGING_SECRET.md pattern

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
  v_debug_info JSONB := '{}'::jsonb;
BEGIN
  -- Initialize debug info
  v_debug_info := jsonb_build_object(
    'function_name', 'process_bid_secure',
    'timestamp', NOW()::text,
    'input_params', jsonb_build_object(
      'p_art_id', p_art_id,
      'p_amount', p_amount
    )
  );

  -- Get authenticated user
  v_auth_user_id := auth.uid();
  v_debug_info := v_debug_info || jsonb_build_object('auth_user_id', v_auth_user_id);

  IF v_auth_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Authentication required',
      'debug', v_debug_info
    );
  END IF;

  -- Get user phone from auth.users table
  SELECT phone INTO v_auth_phone
  FROM auth.users
  WHERE id = v_auth_user_id;
  
  v_debug_info := v_debug_info || jsonb_build_object('auth_phone', v_auth_phone);

  IF v_auth_phone IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Phone number required for bidding. Please update your profile.',
      'debug', v_debug_info
    );
  END IF;

  -- Get person record
  SELECT id INTO v_person_id
  FROM people
  WHERE auth_user_id = v_auth_user_id;
  
  v_debug_info := v_debug_info || jsonb_build_object('person_id', v_person_id);

  IF v_person_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User profile not found - please complete phone verification',
      'debug', v_debug_info
    );
  END IF;

  -- Get art record with detailed debug info
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

  -- Add detailed artwork debug info
  v_debug_info := v_debug_info || jsonb_build_object(
    'artwork_found', (v_art_uuid IS NOT NULL),
    'artwork_details', jsonb_build_object(
      'art_uuid', v_art_uuid,
      'event_id', v_event_id,
      'art_status', v_art_status,
      'current_bid', v_current_bid,
      'round', v_round,
      'easel', v_easel,
      'artist_name', v_artist_name,
      'min_increment', v_min_increment,
      'auction_start_bid', v_auction_start_bid,
      'currency_symbol', v_currency_symbol,
      'currency_code', v_currency_code
    )
  );

  -- Check if art exists
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unable to find the matching Art',
      'debug', v_debug_info
    );
  END IF;

  -- Check if auction is enabled with debug info
  IF v_art_status <> 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This artwork is not currently accepting bids',
      'debug', v_debug_info || jsonb_build_object(
        'status_check_failed', true,
        'expected_status', 'active',
        'actual_status', v_art_status
      )
    );
  END IF;

  -- Bid validation with debug info
  v_debug_info := v_debug_info || jsonb_build_object(
    'bid_validation', jsonb_build_object(
      'requested_amount', p_amount,
      'current_bid', v_current_bid,
      'auction_start_bid', v_auction_start_bid,
      'min_increment', v_min_increment
    )
  );

  -- Determine minimum bid with detailed logic
  IF v_current_bid IS NULL OR v_current_bid = 0 THEN
    IF p_amount < v_auction_start_bid THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Bid must be at least ' || v_currency_symbol || v_auction_start_bid,
        'debug', v_debug_info || jsonb_build_object(
          'validation_failed', 'below_start_bid',
          'required_minimum', v_auction_start_bid
        )
      );
    END IF;
  ELSE
    IF p_amount <= v_current_bid THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Bid must be higher than current bid of ' || v_currency_symbol || v_current_bid,
        'debug', v_debug_info || jsonb_build_object(
          'validation_failed', 'not_higher_than_current',
          'required_minimum', v_current_bid + 0.01
        )
      );
    END IF;

    IF (p_amount - v_current_bid) < v_min_increment THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Bid increment must be at least ' || v_currency_symbol || v_min_increment,
        'debug', v_debug_info || jsonb_build_object(
          'validation_failed', 'insufficient_increment',
          'current_increment', (p_amount - v_current_bid),
          'required_increment', v_min_increment
        )
      );
    END IF;
  END IF;

  -- Process the bid (this is where the exception might occur)
  v_bid_id := gen_random_uuid();
  v_debug_info := v_debug_info || jsonb_build_object('bid_id', v_bid_id);

  -- Return success (we'll add the actual INSERT after debugging)
  RETURN jsonb_build_object(
    'success', true,
    'message', 'DEBUG: Bid validation passed - actual insertion temporarily disabled',
    'debug', v_debug_info
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in process_bid_secure: %', SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'An error occurred processing your bid',
      'debug', v_debug_info || jsonb_build_object(
        'exception_details', jsonb_build_object(
          'sqlstate', SQLSTATE,
          'sqlerrm', SQLERRM,
          'error_context', 'Database operation failed'
        )
      )
    );
END;
$function$;