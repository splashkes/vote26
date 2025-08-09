-- Fix admin_update_art_status function to properly cast text to art_status enum

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

        -- Send improved SMS to winner
        v_message_id := send_sms_instantly(
          p_destination := v_phone,
          p_message_body := format(
            '🎉 Congratulations! You won %s''s artwork for %s%s (tax included). Complete your purchase: %s',
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
            'message_version', 'improved_v1'
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