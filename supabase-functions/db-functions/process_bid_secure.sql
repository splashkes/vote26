                                           pg_get_functiondef                                            
---------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.process_bid_secure(p_art_id text, p_amount numeric)                  +
  RETURNS jsonb                                                                                         +
  LANGUAGE plpgsql                                                                                      +
  SECURITY DEFINER                                                                                      +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                       +
 AS $function$                                                                                          +
  DECLARE                                                                                               +
    v_auth_user_id UUID;                                                                                +
    v_auth_phone TEXT;                                                                                  +
    v_person_id UUID;                                                                                   +
    v_event_id UUID;                                                                                    +
    v_art_uuid UUID;                                                                                    +
    v_current_bid DECIMAL;                                                                              +
    v_min_increment DECIMAL;                                                                            +
    v_auction_start_bid DECIMAL;                                                                        +
    v_previous_bidder_id UUID;                                                                          +
    v_bid_id UUID;                                                                                      +
    v_art_status TEXT;                                                                                  +
    v_event_number TEXT;                                                                                +
    v_artist_name TEXT;                                                                                 +
    v_currency_symbol TEXT;                                                                             +
    v_currency_code TEXT;                                                                               +
    v_round INT;                                                                                        +
    v_easel INT;                                                                                        +
    v_extension_result JSONB;                                                                           +
    v_nickname TEXT;                                                                                    +
    v_debug_info JSONB := '{}'::jsonb;                                                                  +
    v_event_phone TEXT;                                                                                 +
    v_bidder_phone_last4 TEXT;                                                                          +
  BEGIN                                                                                                 +
    -- Initialize debug info                                                                            +
    v_debug_info := jsonb_build_object(                                                                 +
      'function_name', 'process_bid_secure',                                                            +
      'timestamp', NOW()::text,                                                                         +
      'input_params', jsonb_build_object(                                                               +
        'p_art_id', p_art_id,                                                                           +
        'p_amount', p_amount                                                                            +
      )                                                                                                 +
    );                                                                                                  +
                                                                                                        +
    -- Get authenticated user                                                                           +
    v_auth_user_id := auth.uid();                                                                       +
    v_debug_info := v_debug_info || jsonb_build_object('auth_user_id', v_auth_user_id);                 +
                                                                                                        +
    IF v_auth_user_id IS NULL THEN                                                                      +
      RETURN jsonb_build_object(                                                                        +
        'success', false,                                                                               +
        'error', 'Authentication required',                                                             +
        'debug', v_debug_info                                                                           +
      );                                                                                                +
    END IF;                                                                                             +
                                                                                                        +
    -- Get user phone from auth.users table                                                             +
    SELECT phone INTO v_auth_phone                                                                      +
    FROM auth.users                                                                                     +
    WHERE id = v_auth_user_id;                                                                          +
                                                                                                        +
    v_debug_info := v_debug_info || jsonb_build_object('auth_phone', v_auth_phone);                     +
                                                                                                        +
    IF v_auth_phone IS NULL THEN                                                                        +
      RETURN jsonb_build_object(                                                                        +
        'success', false,                                                                               +
        'error', 'Phone number required for bidding. Please update your profile.',                      +
        'debug', v_debug_info                                                                           +
      );                                                                                                +
    END IF;                                                                                             +
                                                                                                        +
    -- Extract nickname from app_meta_data for display (optional)                                       +
    SELECT                                                                                              +
      COALESCE(                                                                                         +
        raw_app_meta_data->>'nickname',                                                                 +
        raw_app_meta_data->>'name',                                                                     +
        SPLIT_PART(raw_app_meta_data->>'email', '@', 1)                                                 +
      ) INTO v_nickname                                                                                 +
    FROM auth.users                                                                                     +
    WHERE id = v_auth_user_id;                                                                          +
                                                                                                        +
    -- Get person record                                                                                +
    SELECT id INTO v_person_id                                                                          +
    FROM people                                                                                         +
    WHERE auth_user_id = v_auth_user_id;                                                                +
                                                                                                        +
    v_debug_info := v_debug_info || jsonb_build_object('person_id', v_person_id);                       +
                                                                                                        +
    IF v_person_id IS NULL THEN                                                                         +
      RETURN jsonb_build_object(                                                                        +
        'success', false,                                                                               +
        'error', 'User profile not found - please complete phone verification',                         +
        'debug', v_debug_info                                                                           +
      );                                                                                                +
    END IF;                                                                                             +
                                                                                                        +
    -- Extract event number from art code                                                               +
    v_event_number := SPLIT_PART(p_art_id, '-', 1);                                                     +
                                                                                                        +
    -- Get art record with detailed debug info (ADDED: e.phone_number)                                  +
    SELECT                                                                                              +
      a.id,                                                                                             +
      a.event_id,                                                                                       +
      a.status::text,                                                                                   +
      a.current_bid,                                                                                    +
      a.round,                                                                                          +
      a.easel,                                                                                          +
      COALESCE(ap.name, 'Artist'),                                                                      +
      e.min_bid_increment,                                                                              +
      e.auction_start_bid,                                                                              +
      COALESCE(co.currency_symbol, '$'),                                                                +
      COALESCE(co.currency_code, 'USD'),                                                                +
      e.phone_number                                                                                    +
    INTO                                                                                                +
      v_art_uuid,                                                                                       +
      v_event_id,                                                                                       +
      v_art_status,                                                                                     +
      v_current_bid,                                                                                    +
      v_round,                                                                                          +
      v_easel,                                                                                          +
      v_artist_name,                                                                                    +
      v_min_increment,                                                                                  +
      v_auction_start_bid,                                                                              +
      v_currency_symbol,                                                                                +
      v_currency_code,                                                                                  +
      v_event_phone                                                                                     +
    FROM art a                                                                                          +
    JOIN events e ON a.event_id = e.id                                                                  +
    JOIN cities c ON e.city_id = c.id                                                                   +
    JOIN countries co ON c.country_id = co.id                                                           +
    LEFT JOIN artist_profiles ap ON a.artist_id = ap.id                                                 +
    WHERE a.art_code = p_art_id;                                                                        +
                                                                                                        +
    -- Add detailed artwork debug info                                                                  +
    v_debug_info := v_debug_info || jsonb_build_object(                                                 +
      'artwork_found', (v_art_uuid IS NOT NULL),                                                        +
      'artwork_details', jsonb_build_object(                                                            +
        'art_uuid', v_art_uuid,                                                                         +
        'event_id', v_event_id,                                                                         +
        'art_status', v_art_status,                                                                     +
        'current_bid', v_current_bid,                                                                   +
        'round', v_round,                                                                               +
        'easel', v_easel,                                                                               +
        'artist_name', v_artist_name,                                                                   +
        'min_increment', v_min_increment,                                                               +
        'auction_start_bid', v_auction_start_bid,                                                       +
        'currency_symbol', v_currency_symbol,                                                           +
        'currency_code', v_currency_code                                                                +
      )                                                                                                 +
    );                                                                                                  +
                                                                                                        +
    -- Check if art exists                                                                              +
    IF NOT FOUND THEN                                                                                   +
      RETURN jsonb_build_object(                                                                        +
        'success', false,                                                                               +
        'error', 'Unable to find the matching Art',                                                     +
        'debug', v_debug_info                                                                           +
      );                                                                                                +
    END IF;                                                                                             +
                                                                                                        +
    -- Check if auction is enabled (status must be 'active')                                            +
    IF v_art_status <> 'active' THEN                                                                    +
      RETURN jsonb_build_object(                                                                        +
        'success', false,                                                                               +
        'error', 'This artwork is not currently accepting bids',                                        +
        'debug', v_debug_info || jsonb_build_object(                                                    +
          'status_check_failed', true,                                                                  +
          'expected_status', 'active',                                                                  +
          'actual_status', v_art_status                                                                 +
        )                                                                                               +
      );                                                                                                +
    END IF;                                                                                             +
                                                                                                        +
    -- Bid validation with debug info                                                                   +
    v_debug_info := v_debug_info || jsonb_build_object(                                                 +
      'bid_validation', jsonb_build_object(                                                             +
        'requested_amount', p_amount,                                                                   +
        'current_bid', v_current_bid,                                                                   +
        'auction_start_bid', v_auction_start_bid,                                                       +
        'min_increment', v_min_increment                                                                +
      )                                                                                                 +
    );                                                                                                  +
                                                                                                        +
    -- Determine minimum bid                                                                            +
    IF v_current_bid IS NULL OR v_current_bid = 0 THEN                                                  +
      IF p_amount < v_auction_start_bid THEN                                                            +
        RETURN jsonb_build_object(                                                                      +
          'success', false,                                                                             +
          'error', 'Bid must be at least ' || v_currency_symbol || v_auction_start_bid,                 +
          'debug', v_debug_info || jsonb_build_object(                                                  +
            'validation_failed', 'below_start_bid'                                                      +
          )                                                                                             +
        );                                                                                              +
      END IF;                                                                                           +
    ELSE                                                                                                +
      IF p_amount <= v_current_bid THEN                                                                 +
        RETURN jsonb_build_object(                                                                      +
          'success', false,                                                                             +
          'error', 'Bid must be higher than current bid of ' || v_currency_symbol || v_current_bid,     +
          'debug', v_debug_info || jsonb_build_object(                                                  +
            'validation_failed', 'not_higher_than_current'                                              +
          )                                                                                             +
        );                                                                                              +
      END IF;                                                                                           +
                                                                                                        +
      IF (p_amount - v_current_bid) < v_min_increment THEN                                              +
        RETURN jsonb_build_object(                                                                      +
          'success', false,                                                                             +
          'error', 'Bid increment must be at least ' || v_currency_symbol || v_min_increment,           +
          'debug', v_debug_info || jsonb_build_object(                                                  +
            'validation_failed', 'insufficient_increment'                                               +
          )                                                                                             +
        );                                                                                              +
      END IF;                                                                                           +
    END IF;                                                                                             +
                                                                                                        +
    -- Get previous bidder info for notifications                                                       +
    SELECT person_id INTO v_previous_bidder_id                                                          +
    FROM bids                                                                                           +
    WHERE art_id = v_art_uuid                                                                           +
      AND amount = v_current_bid                                                                        +
    ORDER BY created_at DESC                                                                            +
    LIMIT 1;                                                                                            +
                                                                                                        +
    -- Process the bid                                                                                  +
    v_bid_id := gen_random_uuid();                                                                      +
                                                                                                        +
    -- Add debug info before INSERT                                                                     +
    v_debug_info := v_debug_info || jsonb_build_object(                                                 +
      'about_to_insert', jsonb_build_object(                                                            +
        'bid_id', v_bid_id,                                                                             +
        'event_id', v_event_id,                                                                         +
        'round', v_round,                                                                               +
        'easel', v_easel,                                                                               +
        'art_id_uuid', v_art_uuid,                                                                      +
        'person_id', v_person_id,                                                                       +
        'amount', p_amount                                                                              +
      )                                                                                                 +
    );                                                                                                  +
                                                                                                        +
    -- Insert bid                                                                                       +
    INSERT INTO bids (                                                                                  +
      id,                                                                                               +
      art_id,                                                                                           +
      person_id,                                                                                        +
      amount,                                                                                           +
      created_at,                                                                                       +
      currency_code,                                                                                    +
      currency_symbol                                                                                   +
    ) VALUES (                                                                                          +
      v_bid_id,                                                                                         +
      v_art_uuid,                                                                                       +
      v_person_id,                                                                                      +
      p_amount,                                                                                         +
      NOW(),                                                                                            +
      v_currency_code,                                                                                  +
      v_currency_symbol                                                                                 +
    );                                                                                                  +
                                                                                                        +
    -- Update artwork current bid                                                                       +
    UPDATE art                                                                                          +
    SET                                                                                                 +
      current_bid = p_amount,                                                                           +
      updated_at = NOW()                                                                                +
    WHERE id = v_art_uuid;                                                                              +
                                                                                                        +
    -- Try to check auction extension                                                                   +
    BEGIN                                                                                               +
      SELECT check_and_extend_auction(v_art_uuid) INTO v_extension_result;                              +
    EXCEPTION                                                                                           +
      WHEN OTHERS THEN                                                                                  +
        v_extension_result := jsonb_build_object('error', 'Extension check failed: ' || SQLERRM);       +
    END;                                                                                                +
                                                                                                        +
    -- Send bid confirmation SMS to current bidder (ASYNC - won't fail the bid)                         +
    BEGIN                                                                                               +
      PERFORM queue_bid_confirmation(                                                                   +
        p_user_mongo_id := NULL,                                                                        +
        p_person_id := v_person_id,                                                                     +
        p_art_id := p_art_id,                                                                           +
        p_artist_name := v_artist_name,                                                                 +
        p_amount := p_amount,                                                                           +
        p_currency_symbol := v_currency_symbol,                                                         +
        p_user_data := jsonb_build_object(                                                              +
          'PhoneNumber', v_auth_phone,                                                                  +
          'NickName', COALESCE(v_nickname, 'Bidder'),                                                   +
          'Hash', ''                                                                                    +
        ),                                                                                              +
        p_event_phone_number := v_event_phone                                                           +
      );                                                                                                +
    EXCEPTION WHEN OTHERS THEN                                                                          +
      -- Silently continue - don't break bidding if SMS fails                                           +
      NULL;                                                                                             +
    END;                                                                                                +
                                                                                                        +
    -- Send outbid notification to previous bidder (ASYNC - won't fail the bid)                         +
    IF v_previous_bidder_id IS NOT NULL THEN                                                            +
      BEGIN                                                                                             +
        v_bidder_phone_last4 := RIGHT(REGEXP_REPLACE(COALESCE(v_auth_phone, ''), '[^0-9]', '', 'g'), 4);+
        PERFORM queue_outbid_notification(                                                              +
          p_user_mongo_id := NULL,                                                                      +
          p_person_id := v_previous_bidder_id,                                                          +
          p_art_id := p_art_id,                                                                         +
          p_artist_name := v_artist_name,                                                               +
          p_amount := p_amount,                                                                         +
          p_currency_symbol := v_currency_symbol,                                                       +
          p_outbidder_phone_last4 := COALESCE(v_bidder_phone_last4, '****'),                            +
          p_event_phone_number := v_event_phone                                                         +
        );                                                                                              +
      EXCEPTION WHEN OTHERS THEN                                                                        +
        -- Silently continue                                                                            +
        NULL;                                                                                           +
      END;                                                                                              +
    END IF;                                                                                             +
                                                                                                        +
    -- Try to queue Slack notification (existing code)                                                  +
    BEGIN                                                                                               +
      PERFORM queue_bid_notification(                                                                   +
        v_bid_id,                                                                                       +
        v_person_id,                                                                                    +
        v_art_uuid,                                                                                     +
        p_amount,                                                                                       +
        v_previous_bidder_id                                                                            +
      );                                                                                                +
    EXCEPTION                                                                                           +
      WHEN OTHERS THEN                                                                                  +
        NULL;                                                                                           +
    END;                                                                                                +
                                                                                                        +
    -- Return success response                                                                          +
    RETURN jsonb_build_object(                                                                          +
      'success', true,                                                                                  +
      'message', 'Bid placed successfully',                                                             +
      'bid_id', v_bid_id,                                                                               +
      'amount', p_amount,                                                                               +
      'art_id', p_art_id,                                                                               +
      'previous_bid', v_current_bid,                                                                    +
      'bidder_name', COALESCE(v_nickname, 'Anonymous'),                                                 +
      'artist_name', v_artist_name,                                                                     +
      'currency_code', v_currency_code,                                                                 +
      'currency_symbol', v_currency_symbol,                                                             +
      'extension_result', v_extension_result                                                            +
    );                                                                                                  +
                                                                                                        +
  EXCEPTION                                                                                             +
    WHEN OTHERS THEN                                                                                    +
      RAISE WARNING 'Error in process_bid_secure: %', SQLERRM;                                          +
      RETURN jsonb_build_object(                                                                        +
        'success', false,                                                                               +
        'error', 'An error occurred processing your bid',                                               +
        'debug', v_debug_info || jsonb_build_object(                                                    +
          'exception_details', jsonb_build_object(                                                      +
            'sqlstate', SQLSTATE,                                                                       +
            'sqlerrm', SQLERRM,                                                                         +
            'error_context', 'Database operation failed during bid insertion'                           +
          )                                                                                             +
        )                                                                                               +
      );                                                                                                +
  END;                                                                                                  +
  $function$                                                                                            +
 
(1 row)

