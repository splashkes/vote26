-- Fix manage_auction_timer function to handle data type mismatch
-- The issue is that votes.art_id is character varying while art.id is uuid

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

          -- Send SMS instantly
          v_message_id := send_sms_instantly(
            p_destination := v_participants.phone,
            p_message_body := format(
              '%s Auction starts closing in 10 min! Bid now to secure your piece https://artb.art/bid',
              v_event.name
            ),
            p_metadata := jsonb_build_object(
              'type', 'auction_warning',
              'event_id', p_event_id,
              'event_name', v_event.name,
              'person_id', v_participants.person_id,
              'admin_action', 'timer_start',
              'admin_phone', p_admin_phone
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