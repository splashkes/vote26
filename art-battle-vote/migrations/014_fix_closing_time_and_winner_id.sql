-- Fix closing_time and winner_id not being set in auction close functions

-- 1. Fix close_auction_manually function
CREATE OR REPLACE FUNCTION close_auction_manually(p_art_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_art RECORD;
  v_winner RECORD;
  v_phone TEXT;
  v_total_with_tax NUMERIC;
  v_auction_url TEXT;
  v_message_id UUID;
  v_event_code TEXT;
BEGIN
  -- Get art details with full joins to get all required data
  SELECT
    a.*,
    e.name as event_name,
    e.currency,
    e.tax,
    ap.name as artist_name
  INTO v_art
  FROM art a
  JOIN events e ON a.event_id = e.id
  LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
  WHERE a.art_code = p_art_code;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Art not found');
  END IF;

  -- Extract event code from art_code (e.g., "AB2900-1-1" -> "AB2900")
  v_event_code := split_part(p_art_code, '-', 1);

  -- Get winner details
  SELECT
    p.*,
    b.amount as winning_bid
  INTO v_winner
  FROM bids b
  JOIN people p ON b.person_id = p.id
  WHERE b.art_id = v_art.id
  ORDER BY b.amount DESC
  LIMIT 1;

  IF NOT FOUND THEN
    -- No bids, just close the auction with closing time
    UPDATE art SET 
      status = 'closed',
      closing_time = now()
    WHERE art_code = p_art_code;
    RETURN jsonb_build_object('success', true, 'message', 'Auction closed (no bids)');
  END IF;

  -- Update art status, winner, and closing time
  UPDATE art 
  SET 
    status = 'sold',
    winner_id = v_winner.id,
    current_bid = v_winner.winning_bid,
    closing_time = now()
  WHERE art_code = p_art_code;

  -- Get winner's phone
  v_phone := COALESCE(v_winner.auth_phone, v_winner.phone_number);

  IF v_phone IS NOT NULL THEN
    -- Calculate total with tax
    v_total_with_tax := v_winner.winning_bid * (1 + COALESCE(v_art.tax, 0) / 100.0);

    -- Generate auction URL
    v_auction_url := format('https://artb.art/e/%s/auction', v_event_code);

    -- Send SMS to winner
    v_message_id := send_sms_instantly(
      p_destination := v_phone,
      p_message_body := format(
        'Congratulations! You won %s''s artwork for %s%s. Complete your purchase: %s',
        COALESCE(v_art.artist_name, 'Artist'),
        v_art.currency,
        round(v_total_with_tax, 2),
        v_auction_url
      ),
      p_metadata := jsonb_build_object(
        'type', 'auction_winner',
        'art_id', v_art.id,
        'art_code', v_art.art_code,
        'amount', v_winner.winning_bid,
        'total_with_tax', round(v_total_with_tax, 2),
        'winner_id', v_winner.id,
        'event_code', v_event_code,
        'closed_by', 'admin_manual',
        'message_version', 'improved_v2'
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Auction closed successfully',
    'winner', jsonb_build_object(
      'nickname', v_winner.nickname,
      'amount', v_winner.winning_bid,
      'total_with_tax', round(v_total_with_tax, 2)
    ),
    'sms_sent', CASE WHEN v_message_id IS NOT NULL THEN 1 ELSE 0 END
  );
END;
$$;

-- 2. Fix manage_auction_timer function to properly set closing_time and winner_id
CREATE OR REPLACE FUNCTION manage_auction_timer(
  p_event_id UUID,
  p_action TEXT,
  p_duration_minutes INTEGER DEFAULT 12,
  p_admin_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_count INTEGER;
  v_result JSONB;
  v_art RECORD;
  v_winner RECORD;
  v_phone TEXT;
  v_total_with_tax NUMERIC;
  v_auction_url TEXT;
  v_message_id UUID;
  v_event_code TEXT;
BEGIN
  IF p_action = 'start' THEN
    -- Start timer: set closing time for active artworks
    UPDATE art 
    SET closing_time = now() + (p_duration_minutes || ' minutes')::interval
    WHERE event_id = p_event_id 
      AND artist_id IS NOT NULL 
      AND status = 'active'
      AND closing_time IS NULL;
    
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    
    RETURN jsonb_build_object(
      'success', true,
      'action', 'start',
      'duration_minutes', p_duration_minutes,
      'artworks_updated', v_updated_count
    );
    
  ELSIF p_action = 'close' THEN
    -- Close expired auctions and set winners
    FOR v_art IN
      SELECT a.*, e.currency, e.tax, ap.name as artist_name, 
             split_part(a.art_code, '-', 1) as event_code
      FROM art a
      JOIN events e ON a.event_id = e.id
      LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
      WHERE a.event_id = p_event_id 
        AND a.status = 'active'
        AND a.closing_time IS NOT NULL 
        AND a.closing_time <= now()
    LOOP
      -- Get winner for this artwork
      SELECT p.*, b.amount as winning_bid
      INTO v_winner
      FROM bids b
      JOIN people p ON b.person_id = p.id
      WHERE b.art_id = v_art.id
      ORDER BY b.amount DESC
      LIMIT 1;

      IF FOUND THEN
        -- Update with winner
        UPDATE art 
        SET 
          status = 'sold',
          winner_id = v_winner.id,
          current_bid = v_winner.winning_bid
        WHERE id = v_art.id;

        -- Send SMS to winner
        v_phone := COALESCE(v_winner.auth_phone, v_winner.phone_number);
        IF v_phone IS NOT NULL THEN
          v_total_with_tax := v_winner.winning_bid * (1 + COALESCE(v_art.tax, 0) / 100.0);
          v_auction_url := format('https://artb.art/e/%s/auction', v_art.event_code);

          v_message_id := send_sms_instantly(
            p_destination := v_phone,
            p_message_body := format(
              'Congratulations! You won %s''s artwork for %s%s. Complete your purchase: %s',
              COALESCE(v_art.artist_name, 'Artist'),
              v_art.currency,
              round(v_total_with_tax, 2),
              v_auction_url
            ),
            p_metadata := jsonb_build_object(
              'type', 'auction_winner',
              'art_id', v_art.id,
              'art_code', v_art.art_code,
              'amount', v_winner.winning_bid,
              'total_with_tax', round(v_total_with_tax, 2),
              'winner_id', v_winner.id,
              'event_code', v_art.event_code,
              'closed_by', 'timer_automatic',
              'message_version', 'improved_v2'
            )
          );
        END IF;
      ELSE
        -- No bids, just close
        UPDATE art 
        SET status = 'closed'
        WHERE id = v_art.id;
      END IF;

      v_updated_count := v_updated_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'close',
      'artworks_closed', v_updated_count
    );
    
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid action. Use "start" or "close"'
    );
  END IF;
END;
$$;