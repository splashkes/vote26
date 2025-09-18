-- Add total bid count to timer data for auction display

CREATE OR REPLACE FUNCTION get_timer_data(event_eid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    event_record record;
    rounds_data jsonb;
    all_rounds_data jsonb;
    upcoming_rounds_data jsonb;
    auction_data jsonb;
    result jsonb;
BEGIN
    -- Strict input validation
    IF event_eid IS NULL OR length(event_eid) = 0 OR length(event_eid) > 20 THEN
        RETURN jsonb_build_object('error', 'Invalid EID format');
    END IF;

    -- Only allow access to events within 36 hours and that are enabled/visible
    SELECT e.id, e.eid, e.name, e.venue, e.current_round, e.event_start_datetime, c.name as city_name
    INTO event_record
    FROM events e
    LEFT JOIN cities c ON e.city_id = c.id
    WHERE e.eid = event_eid
      AND e.enabled = true
      AND e.show_in_app = true
      AND e.event_start_datetime IS NOT NULL
      AND e.event_start_datetime > (now() - interval '36 hours')
      AND e.event_start_datetime < (now() + interval '36 hours');

    -- Return error if event not found or outside time window
    IF event_record IS NULL THEN
        RETURN jsonb_build_object('error', 'Event not found');
    END IF;

    -- Get rounds data (only closing_time, round_number, and contestant count)
    SELECT jsonb_agg(
        jsonb_build_object(
            'round', r.round_number,
            'closing_time', r.closing_time,
            'start_time', (r.closing_time - interval '20 minutes'),
            'artists', COALESCE(rc.contestant_count, 0),
            'is_past', (r.closing_time < now())
        )
        ORDER BY r.round_number
    )
    INTO all_rounds_data
    FROM rounds r
    LEFT JOIN (
        SELECT round_id, count(*) as contestant_count
        FROM round_contestants
        GROUP BY round_id
    ) rc ON r.id = rc.round_id
    WHERE r.event_id = event_record.id
      AND r.closing_time IS NOT NULL;

    -- Get active rounds (within 30 minutes future OR within 1 minute past for grace period)
    SELECT jsonb_agg(
        jsonb_build_object(
            'round', r.round_number,
            'closing_time', r.closing_time,
            'artists', COALESCE(rc.contestant_count, 0),
            'is_grace_period', (r.closing_time < now() AND r.closing_time > (now() - interval '1 minute'))
        )
        ORDER BY r.round_number
    )
    INTO rounds_data
    FROM rounds r
    LEFT JOIN (
        SELECT round_id, count(*) as contestant_count
        FROM round_contestants
        GROUP BY round_id
    ) rc ON r.id = rc.round_id
    WHERE r.event_id = event_record.id
      AND r.closing_time IS NOT NULL
      AND (
        -- Future rounds within 30 minutes
        (r.closing_time <= (now() + interval '30 minutes') AND r.closing_time > now())
        OR
        -- Past rounds within 1 minute (grace period)
        (r.closing_time < now() AND r.closing_time > (now() - interval '1 minute'))
      );

    -- Get upcoming rounds (no closing time but have contestants)
    SELECT jsonb_agg(
        jsonb_build_object(
            'round', r.round_number,
            'artists', COALESCE(rc.contestant_count, 0),
            'artist_names', COALESCE(artist_list.names, '[]'::jsonb)
        )
        ORDER BY r.round_number
    )
    INTO upcoming_rounds_data
    FROM rounds r
    LEFT JOIN (
        SELECT round_id, count(*) as contestant_count
        FROM round_contestants
        GROUP BY round_id
    ) rc ON r.id = rc.round_id
    LEFT JOIN (
        SELECT
            round_id,
            jsonb_agg(
                jsonb_build_object(
                    'name', ap.name,
                    'easel', round_contestants.easel_number
                )
                ORDER BY round_contestants.easel_number
            ) as names
        FROM round_contestants
        JOIN artist_profiles ap ON round_contestants.artist_id = ap.id
        GROUP BY round_id
    ) artist_list ON r.id = artist_list.round_id
    WHERE r.event_id = event_record.id
      AND r.closing_time IS NULL
      AND rc.contestant_count > 1;

    -- Get auction data with bid counts
    WITH active_art_count AS (
        SELECT count(*) as total_active
        FROM art
        WHERE event_id = event_record.id
          AND status = 'active'
    ),
    timed_auctions AS (
        SELECT min(closing_time) as earliest,
               max(closing_time) as latest,
               count(*) as count,
               (min(closing_time) = max(closing_time)) as same_time,
               (max(closing_time) < now()) as all_timers_expired
        FROM art
        WHERE event_id = event_record.id
          AND status = 'active'
          AND closing_time IS NOT NULL
    ),
    bid_counts AS (
        SELECT count(*) as total_bids
        FROM bids b
        JOIN art a ON b.art_id = a.id
        WHERE a.event_id = event_record.id
    )
    SELECT jsonb_build_object(
        'earliest', ta.earliest,
        'latest', ta.latest,
        'count', ta.count,
        'same_time', ta.same_time,
        'has_active_items', (aac.total_active > 0),
        'all_timers_expired', COALESCE(ta.all_timers_expired, false),
        'auction_closed', (
            (aac.total_active = 0) OR
            (COALESCE(ta.all_timers_expired, false) AND aac.total_active = 0)
        ),
        'total_bids', COALESCE(bc.total_bids, 0)
    )
    INTO auction_data
    FROM active_art_count aac
    CROSS JOIN timed_auctions ta
    CROSS JOIN bid_counts bc;

    -- Build safe response with only necessary data
    result := jsonb_build_object(
        'event', jsonb_build_object(
            'eid', event_record.eid,
            'name', event_record.name,
            'city', COALESCE(event_record.city_name, 'Unknown'),
            'venue', COALESCE(event_record.venue, 'Unknown Venue'),
            'current_round', event_record.current_round,
            'event_start', event_record.event_start_datetime
        ),
        'rounds', COALESCE(rounds_data, '[]'::jsonb),
        'all_rounds', COALESCE(all_rounds_data, '[]'::jsonb),
        'upcoming_rounds', COALESCE(upcoming_rounds_data, '[]'::jsonb),
        'auction_times', auction_data,
        'timestamp', to_jsonb(now()),
        'has_active_timers', (COALESCE(rounds_data, '[]'::jsonb) != '[]'::jsonb)
    );

    RETURN result;
END;
$$;

-- Add comment
COMMENT ON FUNCTION get_timer_data(text) IS
'Enhanced timer data function with total bid counts for auction display';