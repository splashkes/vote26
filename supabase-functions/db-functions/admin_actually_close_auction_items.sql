                                                      pg_get_functiondef                                                      
------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.admin_actually_close_auction_items(p_art_code text, p_admin_phone text DEFAULT NULL::text)+
  RETURNS jsonb                                                                                                              +
  LANGUAGE plpgsql                                                                                                           +
  SECURITY DEFINER                                                                                                           +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                                            +
 AS $function$                                                                                                               +
  DECLARE                                                                                                                    +
    v_art RECORD;                                                                                                            +
    v_winner RECORD;                                                                                                         +
    v_phone TEXT;                                                                                                            +
    v_total_with_tax NUMERIC;                                                                                                +
    v_auction_url TEXT;                                                                                                      +
    v_message_id UUID;                                                                                                       +
    v_notifications_sent INT := 0;                                                                                           +
    v_event_code TEXT;                                                                                                       +
    v_has_winner BOOLEAN := false;                                                                                           +
    v_determined_status TEXT;                                                                                                +
  BEGIN                                                                                                                      +
    -- Get art details with full joins                                                                                       +
    SELECT                                                                                                                   +
      a.*,                                                                                                                   +
      e.name as event_name,                                                                                                  +
      e.currency,                                                                                                            +
      e.tax,                                                                                                                 +
      ap.name as artist_name                                                                                                 +
    INTO v_art                                                                                                               +
    FROM art a                                                                                                               +
    JOIN events e ON a.event_id = e.id                                                                                       +
    LEFT JOIN artist_profiles ap ON a.artist_id = ap.id                                                                      +
    WHERE a.art_code = p_art_code;                                                                                           +
                                                                                                                             +
    IF NOT FOUND THEN                                                                                                        +
      RETURN jsonb_build_object('success', false, 'error', 'Art not found');                                                 +
    END IF;                                                                                                                  +
                                                                                                                             +
    -- Extract event code from art_code (e.g., "AB2900-1-1" -> "AB2900")                                                     +
    v_event_code := split_part(p_art_code, '-', 1);                                                                          +
                                                                                                                             +
    -- IMPROVED LOGIC: Determine status based on what we actually find                                                       +
    -- Look for the highest bidder to determine if auction should be 'sold' or 'closed'                                      +
    SELECT                                                                                                                   +
      p.*,                                                                                                                   +
      b.amount as winning_bid                                                                                                +
    INTO v_winner                                                                                                            +
    FROM bids b                                                                                                              +
    JOIN people p ON b.person_id = p.id                                                                                      +
    WHERE b.art_id = v_art.id                                                                                                +
    ORDER BY b.amount DESC                                                                                                   +
    LIMIT 1;                                                                                                                 +
                                                                                                                             +
    -- Set status based on actual bid data found (not passed parameter)                                                      +
    IF FOUND THEN                                                                                                            +
      v_has_winner := true;                                                                                                  +
      v_determined_status := 'sold';                                                                                         +
      RAISE NOTICE 'Found winner for %: % with bid %', p_art_code, v_winner.id, v_winner.winning_bid;                        +
    ELSE                                                                                                                     +
      v_has_winner := false;                                                                                                 +
      v_determined_status := 'closed';                                                                                       +
      RAISE NOTICE 'No winner found for %, closing without sale', p_art_code;                                                +
    END IF;                                                                                                                  +
                                                                                                                             +
    -- Update the artwork status based on what we actually determined                                                        +
    UPDATE art SET                                                                                                           +
      status = v_determined_status::art_status,                                                                              +
      closing_time = COALESCE(v_art.closing_time, NOW())                                                                     +
    WHERE art_code = p_art_code;                                                                                             +
                                                                                                                             +
    -- If we found a winner, set winner data and send notification                                                           +
    IF v_has_winner THEN                                                                                                     +
      -- Set winner_id if not already set                                                                                    +
      IF v_art.winner_id IS NULL THEN                                                                                        +
        UPDATE art SET                                                                                                       +
          winner_id = v_winner.id,                                                                                           +
          current_bid = v_winner.winning_bid                                                                                 +
        WHERE id = v_art.id;                                                                                                 +
      END IF;                                                                                                                +
                                                                                                                             +
      -- Send winner notification (only triggers if status changes to 'sold')                                                +
      v_phone := COALESCE(v_winner.auth_phone, v_winner.phone_number, v_winner.phone);                                       +
                                                                                                                             +
      IF v_phone IS NOT NULL THEN                                                                                            +
        -- Calculate total with tax                                                                                          +
        v_total_with_tax := v_winner.winning_bid * (1 + COALESCE(v_art.tax, 0) / 100.0);                                     +
                                                                                                                             +
        -- Generate auction URL                                                                                              +
        v_auction_url := format('https://artb.art/e/%s/auction', v_event_code);                                              +
                                                                                                                             +
        -- FIXED: Send SMS notification with proper currency formatting                                                      +
        v_message_id := send_sms_instantly(                                                                                  +
          p_destination := v_phone,                                                                                          +
          p_message_body := format(                                                                                          +
            'Congratulations! You won %s''s artwork for %s%s. Complete your purchase: %s',                                   +
            COALESCE(v_art.artist_name, 'Artist'),                                                                           +
            COALESCE(v_art.currency, '$'),                                                                                   +
            round(v_total_with_tax, 2),                                                                                      +
            v_auction_url                                                                                                    +
          ),                                                                                                                 +
          p_metadata := jsonb_build_object(                                                                                  +
            'type', 'auction_winner',                                                                                        +
            'art_id', v_art.id,                                                                                              +
            'art_code', v_art.art_code,                                                                                      +
            'winning_bid', v_winner.winning_bid,                                                                             +
            'admin_phone', p_admin_phone                                                                                     +
          )                                                                                                                  +
        );                                                                                                                   +
                                                                                                                             +
        IF v_message_id IS NOT NULL THEN                                                                                     +
          v_notifications_sent := 1;                                                                                         +
        END IF;                                                                                                              +
      END IF;                                                                                                                +
    END IF;                                                                                                                  +
                                                                                                                             +
    RETURN jsonb_build_object(                                                                                               +
      'success', true,                                                                                                       +
      'message', format('Auction closed with status: %s', v_determined_status),                                              +
      'art_code', p_art_code,                                                                                                +
      'determined_status', v_determined_status,                                                                              +
      'has_winner', v_has_winner,                                                                                            +
      'winning_bid', CASE WHEN v_has_winner THEN v_winner.winning_bid ELSE NULL END,                                         +
      'winner_phone', CASE WHEN v_has_winner THEN v_phone ELSE NULL END,                                                     +
      'notifications_sent', v_notifications_sent,                                                                            +
      'admin_phone', p_admin_phone,                                                                                          +
      'timestamp', NOW()                                                                                                     +
    );                                                                                                                       +
                                                                                                                             +
  EXCEPTION                                                                                                                  +
    WHEN OTHERS THEN                                                                                                         +
      RETURN jsonb_build_object(                                                                                             +
        'success', false,                                                                                                    +
        'error', SQLERRM,                                                                                                    +
        'art_code', p_art_code,                                                                                              +
        'admin_phone', p_admin_phone,                                                                                        +
        'timestamp', NOW()                                                                                                   +
      );                                                                                                                     +
  END;                                                                                                                       +
  $function$                                                                                                                 +
 
(1 row)

