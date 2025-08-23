-- Remove emoji and tax reference from winner notification messages

-- 1. Update trigger_auction_closed_notification
CREATE OR REPLACE FUNCTION trigger_auction_closed_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_winner RECORD;
  v_phone TEXT;
  v_total_with_tax NUMERIC;
  v_auction_url TEXT;
  v_message_id UUID;
  v_event RECORD;
  v_artist_name TEXT;
  v_event_code TEXT;
BEGIN
  -- Only trigger on status change to 'closed' or 'sold' (both mean auction ended)
  IF (NEW.status IN ('closed', 'sold')) AND (OLD.status NOT IN ('closed', 'sold')) THEN

    -- Get event and artist info
    SELECT
      e.name as event_name,
      e.currency,
      e.tax,
      COALESCE(ap.name, 'Artist') as artist_name
    INTO v_event
    FROM events e
    LEFT JOIN artist_profiles ap ON ap.id = NEW.artist_id
    WHERE e.id = NEW.event_id;

    v_artist_name := v_event.artist_name;
    -- Extract event code from art_code (e.g., "AB2900-1-1" -> "AB2900")
    v_event_code := split_part(NEW.art_code, '-', 1);

    -- Get the highest bidder
    SELECT
      b.person_id as id,
      b.amount,
      p.phone_number,
      p.auth_phone,
      p.nickname
    INTO v_winner
    FROM bids b
    JOIN people p ON b.person_id = p.id
    WHERE b.art_id = NEW.id
    ORDER BY b.amount DESC
    LIMIT 1;

    IF FOUND THEN
      -- Update winner_id if not already set
      IF NEW.winner_id IS NULL THEN
        UPDATE art SET winner_id = v_winner.id WHERE id = NEW.id;
      END IF;

      -- Send winner SMS notification
      v_phone := COALESCE(v_winner.auth_phone, v_winner.phone_number);

      IF v_phone IS NOT NULL THEN
        -- Calculate total with tax
        v_total_with_tax := v_winner.amount * (1 + COALESCE(v_event.tax, 0) / 100.0);

        -- Generate auction URL instead of payment URL for consistency
        v_auction_url := format('https://artb.art/e/%s/auction', v_event_code);

        -- Send improved SMS instantly (removed emoji and tax reference)
        v_message_id := send_sms_instantly(
          p_destination := v_phone,
          p_message_body := format(
            'Congratulations! You won %s''s artwork for %s%s. Complete your purchase: %s',
            v_artist_name,
            COALESCE(v_event.currency, '$'),
            round(v_total_with_tax, 2),
            v_auction_url
          ),
          p_metadata := jsonb_build_object(
            'type', 'auction_winner',
            'art_id', NEW.id,
            'art_code', NEW.art_code,
            'amount', v_winner.amount,
            'total_with_tax', round(v_total_with_tax, 2),
            'winner_id', v_winner.id,
            'event_code', v_event_code,
            'message_version', 'improved_v2'
          )
        );

        RAISE NOTICE 'Sent winner SMS to % for art %', v_phone, NEW.art_code;
      END IF;

      -- Also trigger Slack notification
      PERFORM send_rich_winner_notification(NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Update close_auction_manually
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
    -- No bids, just close the auction
    UPDATE art SET status = 'closed' WHERE art_code = p_art_code;
    RETURN jsonb_build_object('success', true, 'message', 'Auction closed (no bids)');
  END IF;

  -- Update art status and winner
  UPDATE art 
  SET 
    status = 'sold',
    winner_id = v_winner.id,
    current_bid = v_winner.winning_bid
  WHERE art_code = p_art_code;

  -- Get winner's phone
  v_phone := COALESCE(v_winner.auth_phone, v_winner.phone_number);

  IF v_phone IS NOT NULL THEN
    -- Calculate total with tax
    v_total_with_tax := v_winner.winning_bid * (1 + COALESCE(v_art.tax, 0) / 100.0);

    -- Generate auction URL
    v_auction_url := format('https://artb.art/e/%s/auction', v_event_code);

    -- Send improved SMS (removed emoji and tax reference)
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

-- 3. Update admin_update_art_status
CREATE OR REPLACE FUNCTION admin_update_art_status(
  p_art_code TEXT,
  p_new_status TEXT,
  p_admin_phone TEXT DEFAULT NULL
)
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
  v_notifications_sent INT := 0;
  v_event_code TEXT;
BEGIN
  -- Validate status
  IF p_new_status NOT IN ('active', 'sold', 'closed', 'paid', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid status');
  END IF;

  -- Get art details with full joins
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

  -- Update the status - FIXED: Cast text to art_status enum
  -- If reopening (setting to active), also clear closing time
  IF p_new_status = 'active' THEN
    UPDATE art SET 
      status = p_new_status::art_status,
      closing_time = NULL,
      auction_extended = false,
      extension_count = 0
    WHERE art_code = p_art_code;
  ELSE
    UPDATE art SET status = p_new_status::art_status WHERE art_code = p_art_code;
  END IF;

  -- If setting to 'sold', send winner notification
  IF p_new_status = 'sold' AND v_art.status != 'sold' THEN
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

    IF FOUND THEN
      -- Update winner_id if not already set
      IF v_art.winner_id IS NULL THEN
        UPDATE art SET winner_id = v_winner.id WHERE id = v_art.id;
      END IF;

      v_phone := COALESCE(v_winner.auth_phone, v_winner.phone_number);

      IF v_phone IS NOT NULL THEN
        -- Calculate total with tax
        v_total_with_tax := v_winner.winning_bid * (1 + COALESCE(v_art.tax, 0) / 100.0);

        -- Generate auction URL
        v_auction_url := format('https://artb.art/e/%s/auction', v_event_code);

        -- Send improved SMS to winner (removed emoji and tax reference)
        v_message_id := send_sms_instantly(
          p_destination := v_phone,
          p_message_body := format(
            'Congratulations! You won %s''s artwork for %s%s. Complete your purchase: %s',
            COALESCE(v_art.artist_name, 'Artist'),
            COALESCE(v_art.currency, '$'),
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
            'closed_by', 'admin',
            'admin_phone', p_admin_phone,
            'message_version', 'improved_v2'
          )
        );

        v_notifications_sent := v_notifications_sent + 1;

        -- Also send "not winning" notifications to other bidders
        PERFORM send_not_winning_notifications(
          v_art.id,
          v_winner.id,
          v_winner.winning_bid,
          v_art.art_code,
          COALESCE(v_art.artist_name, 'Artist'),
          COALESCE(v_art.currency, '$'),
          'admin'
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Status updated to %s', p_new_status),
    'notifications_sent', v_notifications_sent
  );
END;
$$;