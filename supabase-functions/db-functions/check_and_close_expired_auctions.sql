                                           pg_get_functiondef                                           
--------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.check_and_close_expired_auctions()                                  +
  RETURNS jsonb                                                                                        +
  LANGUAGE plpgsql                                                                                     +
 AS $function$                                                                                         +
  DECLARE                                                                                              +
    v_artwork RECORD;                                                                                  +
    v_closed_count INT := 0;                                                                           +
    v_sold_count INT := 0;                                                                             +
    v_error_count INT := 0;                                                                            +
    v_result JSONB;                                                                                    +
    v_results JSONB[] := ARRAY[]::JSONB[];                                                             +
    v_bid_count INT;                                                                                   +
    v_target_status TEXT;                                                                              +
  BEGIN                                                                                                +
    -- Find all active artworks with expired closing times                                             +
    FOR v_artwork IN                                                                                   +
      SELECT                                                                                           +
        art_code,                                                                                      +
        id,                                                                                            +
        closing_time,                                                                                  +
        artist_id                                                                                      +
      FROM art                                                                                         +
      WHERE status = 'active'                                                                          +
      AND closing_time IS NOT NULL                                                                     +
      AND closing_time <= NOW()                                                                        +
      ORDER BY closing_time                                                                            +
    LOOP                                                                                               +
      -- Check if artwork has bids                                                                     +
      SELECT COUNT(*) INTO v_bid_count                                                                 +
      FROM bids                                                                                        +
      WHERE art_id = v_artwork.id;                                                                     +
                                                                                                       +
      -- FIXED LOGIC: 'sold' only if has bids, otherwise 'closed'                                      +
      -- No need to check artist_id - bids are what matter for sale status                             +
      IF v_bid_count > 0 THEN                                                                          +
        v_target_status := 'sold';                                                                     +
      ELSE                                                                                             +
        v_target_status := 'closed';                                                                   +
      END IF;                                                                                          +
                                                                                                       +
      -- Use the existing admin function to close/sell each artwork                                    +
      v_result := admin_update_art_status(                                                             +
        p_art_code := v_artwork.art_code,                                                              +
        p_new_status := v_target_status,                                                               +
        p_admin_phone := 'system-auto-close'                                                           +
      );                                                                                               +
                                                                                                       +
      IF (v_result->>'success')::boolean THEN                                                          +
        IF v_target_status = 'sold' THEN                                                               +
          v_sold_count := v_sold_count + 1;                                                            +
          RAISE NOTICE 'Auto-sold auction for % at % (% bids, has artist: %)',                         +
            v_artwork.art_code, v_artwork.closing_time, v_bid_count, (v_artwork.artist_id IS NOT NULL);+
        ELSE                                                                                           +
          v_closed_count := v_closed_count + 1;                                                        +
          RAISE NOTICE 'Auto-closed auction for % at % (% bids, has artist: %)',                       +
            v_artwork.art_code, v_artwork.closing_time, v_bid_count, (v_artwork.artist_id IS NOT NULL);+
        END IF;                                                                                        +
        v_results := array_append(v_results, v_result);                                                +
      ELSE                                                                                             +
        v_error_count := v_error_count + 1;                                                            +
        RAISE WARNING 'Failed to auto-close %: %', v_artwork.art_code, v_result->>'error';             +
      END IF;                                                                                          +
    END LOOP;                                                                                          +
                                                                                                       +
    RETURN jsonb_build_object(                                                                         +
      'success', true,                                                                                 +
      'sold_count', v_sold_count,                                                                      +
      'closed_count', v_closed_count,                                                                  +
      'error_count', v_error_count,                                                                    +
      'timestamp', NOW(),                                                                              +
      'details', v_results                                                                             +
    );                                                                                                 +
  EXCEPTION                                                                                            +
    WHEN OTHERS THEN                                                                                   +
      RETURN jsonb_build_object(                                                                       +
        'success', false,                                                                              +
        'error', SQLERRM,                                                                              +
        'sold_count', v_sold_count,                                                                    +
        'closed_count', v_closed_count,                                                                +
        'error_count', v_error_count,                                                                  +
        'timestamp', NOW()                                                                             +
      );                                                                                               +
  END;                                                                                                 +
  $function$                                                                                           +
 
(1 row)

