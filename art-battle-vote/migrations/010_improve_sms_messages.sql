-- Improve SMS message templates for better user experience and consistent URLs

-- 1. Update bid confirmation message to be more user-friendly
CREATE OR REPLACE FUNCTION queue_bid_confirmation(
  p_user_mongo_id TEXT,
  p_person_id UUID,
  p_art_id TEXT, -- This is actually art_code like "AB2900-1-1"  
  p_artist_name TEXT,
  p_amount NUMERIC,
  p_currency_symbol TEXT,
  p_user_data JSONB,
  p_event_phone_number TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_phone TEXT;
  v_nickname TEXT;
  v_hash TEXT;
  v_auction_url TEXT;
  v_message TEXT;
  v_message_id UUID;
  v_event_id TEXT;
  v_round_num TEXT;
BEGIN
  -- Extract user data
  v_phone := p_user_data->>'PhoneNumber';
  v_nickname := p_user_data->>'NickName';
  v_hash := p_user_data->>'Hash';

  RAISE NOTICE 'queue_bid_confirmation - Phone: %, Nickname: %', v_phone, v_nickname;

  IF v_phone IS NULL THEN
    RAISE WARNING 'No phone number provided in user_data';
    RETURN NULL;
  END IF;

  -- Extract event ID and round from art_code (e.g., "AB2900-1-1" -> "AB2900", "1")
  v_event_id := split_part(p_art_id, '-', 1);
  v_round_num := split_part(p_art_id, '-', 2);

  -- Construct auction tab URL
  v_auction_url := format('%s/e/%s/auction',
    COALESCE(current_setting('app.site_url', true), 'https://artb.art'),
    v_event_id
  );

  -- Format improved message with round information
  v_message := format('Your %s%s bid on %s''s Round %s artwork is confirmed!',
    p_currency_symbol,
    p_amount,
    p_artist_name,
    v_round_num
  );

  RAISE NOTICE 'Sending SMS to % with message: %', v_phone, v_message;

  -- Send instantly
  v_message_id := send_sms_instantly(
    p_destination := v_phone,
    p_message_body := v_message,
    p_metadata := jsonb_build_object(
      'type', 'bid_confirmation',
      'art_id', p_art_id,
      'user_id', p_user_mongo_id,
      'amount', p_amount,
      'nickname', v_nickname,
      'event_id', v_event_id,
      'message_version', 'improved_v1'
    )
  );

  RAISE NOTICE 'SMS queued with ID: %', v_message_id;

  RETURN v_message_id;
END;
$$;

-- 2. Update auction closing warning message in manage_auction_timer function
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
  v_event RECORD;
  v_updated_count INT := 0;
  v_closing_time TIMESTAMP WITH TIME ZONE;
  v_participant_count INT := 0;
  v_sms_count INT := 0;
  v_participants RECORD;
  v_message_id UUID;
  v_event_code TEXT;
BEGIN
  -- Validate action
  IF p_action NOT IN ('start', 'extend', 'cancel', 'close_now') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid action. Must be start, extend, cancel, or close_now'
    );
  END IF;

  -- Get event details
  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event not found');
  END IF;

  -- Extract event code from event name (e.g., "AB2900 - Omaha" -> "AB2900")
  v_event_code := split_part(v_event.name, ' ', 1);

  -- Check if auction is enabled for this event
  IF NOT v_event.enable_auction THEN
    RETURN jsonb_build_object('success', false, 'error', 'Auction not enabled for this event');
  END IF;

  -- Perform the requested action
  CASE p_action
    WHEN 'start' THEN
      -- Set closing time for all active artworks
      v_closing_time := NOW() + (p_duration_minutes || ' minutes')::INTERVAL;

      UPDATE art
      SET
        closing_time = v_closing_time,
        auction_extended = false,
        extension_count = 0,
        updated_at = NOW()
      WHERE
        event_id = p_event_id
        AND status = 'active'
        AND closing_time IS NULL; -- Only set if not already set

      GET DIAGNOSTICS v_updated_count = ROW_COUNT;

      -- Send 10-minute warning SMS to all participants
      IF p_duration_minutes >= 10 THEN
        -- Get all unique participants (voters and bidders)
        FOR v_participants IN
          SELECT DISTINCT
            p.id as person_id,
            COALESCE(p.auth_phone, p.phone_number) as phone,
            p.nickname
          FROM people p
          WHERE EXISTS (
            -- Has voted in this event - FIXED: Cast art.id to text for comparison
            SELECT 1 FROM votes v
            JOIN art a ON v.art_id = a.id::text
            WHERE a.event_id = p_event_id AND v.person_id = p.id
          ) OR EXISTS (
            -- Has bid in this event
            SELECT 1 FROM bids b
            JOIN art a ON b.art_id = a.id
            WHERE a.event_id = p_event_id AND b.person_id = p.id
          )
          AND COALESCE(p.auth_phone, p.phone_number) IS NOT NULL
        LOOP
          v_participant_count := v_participant_count + 1;

          -- Send improved SMS instantly
          v_message_id := send_sms_instantly(
            p_destination := v_participants.phone,
            p_message_body := format(
              '⏰ %s auction ends in 10 minutes! Last chance to bid on your favorites: https://artb.art/e/%s/auction',
              COALESCE(split_part(v_event.name, ' - ', 2), v_event.name),
              v_event_code
            ),
            p_metadata := jsonb_build_object(
              'type', 'auction_warning',
              'event_id', p_event_id,
              'event_name', v_event.name,
              'event_code', v_event_code,
              'person_id', v_participants.person_id,
              'admin_action', 'timer_start',
              'admin_phone', p_admin_phone,
              'message_version', 'improved_v1'
            )
          );

          IF v_message_id IS NOT NULL THEN
            v_sms_count := v_sms_count + 1;
          END IF;
        END LOOP;
      END IF;

      RETURN jsonb_build_object(
        'success', true,
        'message', format('Auction timer started for %s artworks', v_updated_count),
        'closing_time', v_closing_time,
        'artworks_updated', v_updated_count,
        'participants_notified', v_participant_count,
        'sms_sent', v_sms_count
      );

    WHEN 'extend' THEN
      -- Extend closing time by 5 minutes for all artworks with timers
      UPDATE art
      SET
        closing_time = closing_time + INTERVAL '5 minutes',
        auction_extended = true,
        extension_count = extension_count + 1,
        updated_at = NOW()
      WHERE
        event_id = p_event_id
        AND status = 'active'
        AND closing_time IS NOT NULL
        AND closing_time > NOW(); -- Only extend if not already passed

      GET DIAGNOSTICS v_updated_count = ROW_COUNT;

      RETURN jsonb_build_object(
        'success', true,
        'message', format('Extended %s auction timers by 5 minutes', v_updated_count),
        'artworks_updated', v_updated_count
      );

    WHEN 'cancel' THEN
      -- Remove all closing times
      UPDATE art
      SET
        closing_time = NULL,
        auction_extended = false,
        extension_count = 0,
        updated_at = NOW()
      WHERE
        event_id = p_event_id
        AND closing_time IS NOT NULL;

      GET DIAGNOSTICS v_updated_count = ROW_COUNT;

      RETURN jsonb_build_object(
        'success', true,
        'message', format('Cancelled timers for %s artworks', v_updated_count),
        'artworks_updated', v_updated_count
      );

    WHEN 'close_now' THEN
      -- Close all artworks that have timers (except those with recent bids)
      UPDATE art
      SET
        status = 'closed',
        updated_at = NOW()
      WHERE
        event_id = p_event_id
        AND status = 'active'
        AND closing_time IS NOT NULL
        AND NOT EXISTS (
          -- Don't close if there's a bid in the last 5 minutes
          SELECT 1 FROM bids b
          WHERE b.art_id = art.id
          AND b.created_at > NOW() - INTERVAL '5 minutes'
        );

      GET DIAGNOSTICS v_updated_count = ROW_COUNT;

      -- Also update closing time to now for those with recent bids
      UPDATE art
      SET
        closing_time = NOW() + INTERVAL '5 minutes',
        auction_extended = true,
        extension_count = extension_count + 1,
        updated_at = NOW()
      WHERE
        event_id = p_event_id
        AND status = 'active'
        AND closing_time IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM bids b
          WHERE b.art_id = art.id
          AND b.created_at > NOW() - INTERVAL '5 minutes'
        );

      RETURN jsonb_build_object(
        'success', true,
        'message', format('Closed %s auctions, extended others with recent bids', v_updated_count),
        'artworks_closed', v_updated_count
      );
  END CASE;

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'An error occurred',
      'detail', SQLERRM
    );
END;
$$;

-- 3. Update winner notification trigger with improved message
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

        -- Send improved SMS instantly
        v_message_id := send_sms_instantly(
          p_destination := v_phone,
          p_message_body := format(
            '🎉 Congratulations! You won %s''s artwork for %s%s (tax included). Complete your purchase: %s',
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
            'message_version', 'improved_v1'
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