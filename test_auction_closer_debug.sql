-- Debug version of check_and_close_expired_auctions to identify race condition
CREATE OR REPLACE FUNCTION debug_check_and_close_expired_auctions()
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_artwork RECORD;
  v_closed_count INT := 0;
  v_sold_count INT := 0;
  v_error_count INT := 0;
  v_result JSONB;
  v_results JSONB[] := ARRAY[]::JSONB[];
  v_bid_count INT;
  v_target_status TEXT;
  v_debug_info JSONB;
  v_winner_check RECORD;
BEGIN
  -- Find all active artworks with expired closing times
  FOR v_artwork IN
    SELECT
      art_code,
      id,
      closing_time,
      artist_id
    FROM art
    WHERE status = 'active'
    AND closing_time IS NOT NULL
    AND closing_time <= NOW()
    ORDER BY closing_time
  LOOP
    -- Check if artwork has bids (same query as original)
    SELECT COUNT(*) INTO v_bid_count
    FROM bids
    WHERE art_id = v_artwork.id;

    -- Also check what admin function would find (same query admin function uses)
    SELECT
      p.id as person_id,
      b.amount as winning_bid,
      p.phone_number,
      p.auth_phone
    INTO v_winner_check
    FROM bids b
    JOIN people p ON b.person_id = p.id
    WHERE b.art_id = v_artwork.id
    ORDER BY b.amount DESC
    LIMIT 1;

    -- FIXED LOGIC: 'sold' only if has bids, otherwise 'closed'
    IF v_bid_count > 0 THEN
      v_target_status := 'sold';
    ELSE
      v_target_status := 'closed';
    END IF;

    -- Create debug info
    v_debug_info := jsonb_build_object(
      'art_code', v_artwork.art_code,
      'bid_count_query', v_bid_count,
      'winner_found', (v_winner_check.person_id IS NOT NULL),
      'winning_bid', v_winner_check.winning_bid,
      'target_status', v_target_status,
      'timestamp', NOW()
    );

    RAISE NOTICE 'DEBUG: %', v_debug_info;
    
    -- Store debug info instead of calling admin function for now
    v_results := array_append(v_results, v_debug_info);

    IF v_target_status = 'sold' THEN
      v_sold_count := v_sold_count + 1;
    ELSE
      v_closed_count := v_closed_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'sold_count', v_sold_count,
    'closed_count', v_closed_count,
    'error_count', v_error_count,
    'timestamp', NOW(),
    'debug_details', v_results
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'sold_count', v_sold_count,
      'closed_count', v_closed_count,
      'error_count', v_error_count,
      'timestamp', NOW()
    );
END;
$$;