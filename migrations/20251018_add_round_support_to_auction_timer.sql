-- Add round support to manage_auction_timer function
-- This allows admins to start auction timers per round instead of all at once

CREATE OR REPLACE FUNCTION public.manage_auction_timer(
    p_event_id uuid,
    p_action text,
    p_duration_minutes integer DEFAULT 12,
    p_admin_phone text DEFAULT NULL::text,
    p_round_number integer DEFAULT NULL  -- NEW: Optional round filter
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
AS $function$
  DECLARE
    v_event RECORD;
    v_updated_count INT := 0;
    v_closing_time TIMESTAMP WITH TIME ZONE;
    v_participant_count INT := 0;
    v_sms_count INT := 0;
    v_participants RECORD;
    v_message_id UUID;
    v_event_code TEXT;
    v_extended_count INT := 0;
    v_round_text TEXT := '';
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

    -- Set round text for messages
    IF p_round_number IS NOT NULL THEN
      v_round_text := format(' for Round %s', p_round_number);
    END IF;

    -- Perform the requested action
    CASE p_action
      WHEN 'start' THEN
        -- Set closing time for active artworks (filtered by round if specified)
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
          AND closing_time IS NULL -- Only set if not already set
          AND (p_round_number IS NULL OR round = p_round_number) -- Filter by round if specified
          AND artist_id IS NOT NULL; -- Only artworks with assigned artists

        GET DIAGNOSTICS v_updated_count = ROW_COUNT;

        -- Send 10-minute warning SMS to all participants
        IF p_duration_minutes >= 10 THEN
          -- Get all unique participants (voters and bidders) for this round/event
          FOR v_participants IN
            SELECT DISTINCT
              p.id as person_id,
              COALESCE(p.auth_phone, p.phone_number) as phone,
              p.nickname
            FROM people p
            WHERE EXISTS (
              -- Has voted in this event (and round if specified)
              SELECT 1 FROM votes v
              JOIN art a ON v.art_id = a.id::text
              WHERE a.event_id = p_event_id
                AND v.person_id = p.id
                AND (p_round_number IS NULL OR a.round = p_round_number)
            ) OR EXISTS (
              -- Has bid in this event (and round if specified)
              SELECT 1 FROM bids b
              JOIN art a ON b.art_id = a.id
              WHERE a.event_id = p_event_id
                AND b.person_id = p.id
                AND (p_round_number IS NULL OR a.round = p_round_number)
            )
            AND COALESCE(p.auth_phone, p.phone_number) IS NOT NULL
          LOOP
            v_participant_count := v_participant_count + 1;

            -- Send improved SMS instantly
            v_message_id := send_sms_instantly(
              p_destination := v_participants.phone,
              p_message_body := format(
                '⏰ %s auction%s ends in %s minutes! Last chance to bid on your favorites: https://artb.art/e/%s/auction',
                COALESCE(split_part(v_event.name, ' - ', 2), v_event.name),
                v_round_text,
                p_duration_minutes,
                v_event_code
              ),
              p_metadata := jsonb_build_object(
                'type', 'auction_warning',
                'event_id', p_event_id,
                'event_name', v_event.name,
                'event_code', v_event_code,
                'round', p_round_number,
                'person_id', v_participants.person_id,
                'admin_action', 'timer_start',
                'admin_phone', p_admin_phone,
                'message_version', 'improved_v2'
              )
            );

            IF v_message_id IS NOT NULL THEN
              v_sms_count := v_sms_count + 1;
            END IF;
          END LOOP;
        END IF;

        RETURN jsonb_build_object(
          'success', true,
          'message', format('Auction timer started for %s artworks%s', v_updated_count, v_round_text),
          'closing_time', v_closing_time,
          'artworks_updated', v_updated_count,
          'round', p_round_number,
          'participants_notified', v_participant_count,
          'sms_sent', v_sms_count
        );

      WHEN 'extend' THEN
        -- Extend closing time by 5 minutes for artworks with timers (filtered by round if specified)
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
          AND closing_time > NOW() -- Only extend if not already passed
          AND (p_round_number IS NULL OR round = p_round_number); -- Filter by round if specified

        GET DIAGNOSTICS v_updated_count = ROW_COUNT;

        RETURN jsonb_build_object(
          'success', true,
          'message', format('Extended %s auction timers by 5 minutes%s', v_updated_count, v_round_text),
          'artworks_updated', v_updated_count,
          'round', p_round_number
        );

      WHEN 'cancel' THEN
        -- Remove closing times (filtered by round if specified)
        UPDATE art
        SET
          closing_time = NULL,
          auction_extended = false,
          extension_count = 0,
          updated_at = NOW()
        WHERE
          event_id = p_event_id
          AND closing_time IS NOT NULL
          AND (p_round_number IS NULL OR round = p_round_number); -- Filter by round if specified

        GET DIAGNOSTICS v_updated_count = ROW_COUNT;

        RETURN jsonb_build_object(
          'success', true,
          'message', format('Cancelled timers for %s artworks%s', v_updated_count, v_round_text),
          'artworks_updated', v_updated_count,
          'round', p_round_number
        );

      WHEN 'close_now' THEN
        -- Use bid-based status logic (filtered by round if specified)
        UPDATE art
        SET
          status = CASE
            WHEN EXISTS (SELECT 1 FROM bids WHERE bids.art_id = art.id) THEN 'sold'::art_status
            ELSE 'closed'::art_status
          END,
          closing_time = NOW(), -- Set to now for audit trail
          updated_at = NOW()
        WHERE
          event_id = p_event_id
          AND status = 'active'
          AND closing_time IS NOT NULL -- Only close artworks that had active timers
          AND (p_round_number IS NULL OR round = p_round_number); -- Filter by round if specified

        GET DIAGNOSTICS v_updated_count = ROW_COUNT;

        -- Send closure notifications to participants (filtered by round if specified)
        FOR v_participants IN
          SELECT DISTINCT
            p.id as person_id,
            COALESCE(p.auth_phone, p.phone_number) as phone,
            p.nickname
          FROM people p
          WHERE EXISTS (
            -- Has voted in this event/round
            SELECT 1 FROM votes v
            JOIN art a ON v.art_id = a.id::text
            WHERE a.event_id = p_event_id
              AND v.person_id = p.id
              AND (p_round_number IS NULL OR a.round = p_round_number)
          ) OR EXISTS (
            -- Has bid in this event/round
            SELECT 1 FROM bids b
            JOIN art a ON b.art_id = a.id
            WHERE a.event_id = p_event_id
              AND b.person_id = p.id
              AND (p_round_number IS NULL OR a.round = p_round_number)
          )
          AND COALESCE(p.auth_phone, p.phone_number) IS NOT NULL
        LOOP
          v_participant_count := v_participant_count + 1;

          -- Send closure SMS notification
          v_message_id := send_sms_instantly(
            p_destination := v_participants.phone,
            p_message_body := format(
              '🎯 %s auction%s is now closed! Check results and payment notifications: https://artb.art/e/%s/auction',
              COALESCE(split_part(v_event.name, ' - ', 2), v_event.name),
              v_round_text,
              v_event_code
            ),
            p_metadata := jsonb_build_object(
              'type', 'auction_closed',
              'event_id', p_event_id,
              'event_name', v_event.name,
              'event_code', v_event_code,
              'round', p_round_number,
              'person_id', v_participants.person_id,
              'admin_action', 'force_close',
              'admin_phone', p_admin_phone,
              'message_version', 'close_now_v2'
            )
          );

          IF v_message_id IS NOT NULL THEN
            v_sms_count := v_sms_count + 1;
          END IF;
        END LOOP;

        RETURN jsonb_build_object(
          'success', true,
          'message', format('Force closed %s auctions with bid-based statuses%s', v_updated_count, v_round_text),
          'artworks_closed', v_updated_count,
          'round', p_round_number,
          'participants_notified', v_participant_count,
          'sms_sent', v_sms_count
        );

    END CASE;

  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Database error occurred',
        'detail', SQLERRM
      );
  END;
$function$;

-- Add function to get auction timer status by round
CREATE OR REPLACE FUNCTION public.get_auction_timer_status_by_round(p_event_id UUID)
RETURNS TABLE(
    round_number INTEGER,
    artworks_total BIGINT,
    artworks_with_timers BIGINT,
    artworks_active BIGINT,
    earliest_closing TIMESTAMP WITH TIME ZONE,
    latest_closing TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.round as round_number,
        COUNT(*)::BIGINT as artworks_total,
        COUNT(CASE WHEN a.closing_time IS NOT NULL THEN 1 END)::BIGINT as artworks_with_timers,
        COUNT(CASE WHEN a.status = 'active' THEN 1 END)::BIGINT as artworks_active,
        MIN(a.closing_time) as earliest_closing,
        MAX(a.closing_time) as latest_closing
    FROM art a
    WHERE a.event_id = p_event_id
        AND a.artist_id IS NOT NULL  -- Only count artworks with artists
    GROUP BY a.round
    ORDER BY a.round;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;