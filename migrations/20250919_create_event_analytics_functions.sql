-- Event Analytics Database Functions
-- Supporting functions for the event-analytics-dashboard edge function

-- 1. Guest Composition Matrix Function
CREATE OR REPLACE FUNCTION public.get_event_guest_composition(p_event_id uuid)
RETURNS TABLE (
    guest_category text,
    guests bigint,
    guest_pct numeric,
    votes bigint,
    vote_rate numeric,
    bids bigint,
    bid_rate numeric
)
LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    WITH event_participants AS (
        SELECT DISTINCT
            p.id,
            -- Current event activities
            CASE WHEN EXISTS(SELECT 1 FROM votes v WHERE v.person_id = p.id AND v.event_id = p_event_id)
                 THEN 1 ELSE 0 END as voted_event,
            CASE WHEN EXISTS(SELECT 1 FROM bids b JOIN art a ON b.art_id = a.id WHERE b.person_id = p.id AND a.event_id = p_event_id)
                 THEN 1 ELSE 0 END as bid_event,
            CASE WHEN EXISTS(SELECT 1 FROM people_qr_scans pqs WHERE pqs.person_id = p.id AND pqs.event_id = p_event_id)
                 THEN 1 ELSE 0 END as scanned_event,
            -- Check if they have previous event history
            CASE WHEN EXISTS(
                SELECT 1 FROM votes v WHERE v.person_id = p.id AND v.event_id <> p_event_id
                UNION
                SELECT 1 FROM people_qr_scans pqs WHERE pqs.person_id = p.id AND pqs.event_id <> p_event_id
                UNION
                SELECT 1 FROM bids b JOIN art a ON b.art_id = a.id WHERE b.person_id = p.id AND a.event_id <> p_event_id
            ) THEN 1 ELSE 0 END as has_previous_events
        FROM people p
        WHERE p.id IN (
            SELECT person_id FROM people_qr_scans WHERE event_id = p_event_id
            UNION
            SELECT person_id FROM votes WHERE event_id = p_event_id
            UNION
            SELECT b.person_id FROM bids b JOIN art a ON b.art_id = a.id WHERE a.event_id = p_event_id
        )
    ),
    classified_guests AS (
        SELECT *,
            CASE
                WHEN scanned_event = 1 AND has_previous_events = 1 THEN 'QR Scan (Return)'
                WHEN scanned_event = 1 AND has_previous_events = 0 THEN 'QR Scan (New)'
                WHEN scanned_event = 0 AND has_previous_events = 1 THEN 'Online (Return)'
                WHEN scanned_event = 0 AND has_previous_events = 0 THEN 'Online (New)'
                ELSE 'Other'
            END as guest_type
        FROM event_participants
    )
    SELECT
        cg.guest_type::text,
        COUNT(*)::bigint,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1)::numeric,
        SUM(cg.voted_event)::bigint,
        CASE WHEN COUNT(*) > 0 THEN ROUND(SUM(cg.voted_event) * 100.0 / COUNT(*), 1) ELSE 0 END::numeric,
        SUM(cg.bid_event)::bigint,
        CASE WHEN COUNT(*) > 0 THEN ROUND(SUM(cg.bid_event) * 100.0 / COUNT(*), 1) ELSE 0 END::numeric
    FROM classified_guests cg
    GROUP BY cg.guest_type
    ORDER BY
        CASE cg.guest_type
            WHEN 'QR Scan (New)' THEN 1
            WHEN 'QR Scan (Return)' THEN 2
            WHEN 'Online (New)' THEN 3
            WHEN 'Online (Return)' THEN 4
            ELSE 5
        END;
END;
$function$;

-- 2. Time Series Data Function
CREATE OR REPLACE FUNCTION public.get_event_time_series(
    p_event_id uuid,
    p_interval_minutes integer DEFAULT 30
)
RETURNS TABLE (
    time_bucket timestamptz,
    qr_scans_cumulative bigint,
    votes_cumulative bigint,
    bids_cumulative bigint,
    qr_scans_hourly bigint,
    votes_hourly bigint,
    bids_hourly bigint
)
LANGUAGE plpgsql
AS $function$
DECLARE
    event_start timestamptz;
    event_end timestamptz;
    analysis_end_time timestamptz;
BEGIN
    -- Get event timeframe
    SELECT event_start_datetime, event_end_datetime
    INTO event_start, event_end
    FROM events
    WHERE id = p_event_id;

    -- Use current time if event is ongoing
    analysis_end_time := LEAST(COALESCE(event_end, NOW()), NOW());

    -- If no event start time, use today
    IF event_start IS NULL THEN
        event_start := CURRENT_DATE;
    END IF;

    RETURN QUERY
    WITH time_intervals AS (
        SELECT generate_series(
            date_trunc('hour', event_start),
            analysis_end_time,
            (p_interval_minutes || ' minutes')::interval
        ) as interval_start
    ),
    interval_data AS (
        SELECT
            ti.interval_start,
            -- QR Scans
            COUNT(pqs.id) FILTER (WHERE pqs.created_at <= ti.interval_start + (p_interval_minutes || ' minutes')::interval)
                OVER (ORDER BY ti.interval_start) as qr_cumulative,
            COUNT(pqs.id) FILTER (WHERE pqs.created_at BETWEEN ti.interval_start AND ti.interval_start + (p_interval_minutes || ' minutes')::interval)
                as qr_interval,
            -- Votes
            COUNT(v.id) FILTER (WHERE v.created_at <= ti.interval_start + (p_interval_minutes || ' minutes')::interval)
                OVER (ORDER BY ti.interval_start) as votes_cumulative,
            COUNT(v.id) FILTER (WHERE v.created_at BETWEEN ti.interval_start AND ti.interval_start + (p_interval_minutes || ' minutes')::interval)
                as votes_interval,
            -- Bids
            COUNT(b.id) FILTER (WHERE b.created_at <= ti.interval_start + (p_interval_minutes || ' minutes')::interval)
                OVER (ORDER BY ti.interval_start) as bids_cumulative,
            COUNT(b.id) FILTER (WHERE b.created_at BETWEEN ti.interval_start AND ti.interval_start + (p_interval_minutes || ' minutes')::interval)
                as bids_interval
        FROM time_intervals ti
        LEFT JOIN people_qr_scans pqs ON pqs.event_id = p_event_id AND pqs.created_at >= event_start
        LEFT JOIN votes v ON v.event_id = p_event_id AND v.created_at >= event_start
        LEFT JOIN bids b ON b.created_at >= event_start
            AND EXISTS(SELECT 1 FROM art a WHERE a.id = b.art_id AND a.event_id = p_event_id)
        GROUP BY ti.interval_start
        ORDER BY ti.interval_start
    )
    SELECT
        id.interval_start,
        COALESCE(id.qr_cumulative, 0)::bigint,
        COALESCE(id.votes_cumulative, 0)::bigint,
        COALESCE(id.bids_cumulative, 0)::bigint,
        COALESCE(id.qr_interval, 0)::bigint,
        COALESCE(id.votes_interval, 0)::bigint,
        COALESCE(id.bids_interval, 0)::bigint
    FROM interval_data id;
END;
$function$;

-- 3. Recent Activity Function
CREATE OR REPLACE FUNCTION public.get_event_recent_activity(p_event_id uuid)
RETURNS TABLE (
    last_10_minutes_qr bigint,
    last_10_minutes_votes bigint,
    last_10_minutes_bids bigint,
    last_hour_qr bigint,
    last_hour_votes bigint,
    last_hour_bids bigint
)
LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        -- Last 10 minutes
        (SELECT COUNT(*) FROM people_qr_scans WHERE event_id = p_event_id AND created_at >= NOW() - INTERVAL '10 minutes')::bigint,
        (SELECT COUNT(*) FROM votes WHERE event_id = p_event_id AND created_at >= NOW() - INTERVAL '10 minutes')::bigint,
        (SELECT COUNT(*) FROM bids b JOIN art a ON b.art_id = a.id WHERE a.event_id = p_event_id AND b.created_at >= NOW() - INTERVAL '10 minutes')::bigint,
        -- Last hour
        (SELECT COUNT(*) FROM people_qr_scans WHERE event_id = p_event_id AND created_at >= NOW() - INTERVAL '1 hour')::bigint,
        (SELECT COUNT(*) FROM votes WHERE event_id = p_event_id AND created_at >= NOW() - INTERVAL '1 hour')::bigint,
        (SELECT COUNT(*) FROM bids b JOIN art a ON b.art_id = a.id WHERE a.event_id = p_event_id AND b.created_at >= NOW() - INTERVAL '1 hour')::bigint;
END;
$function$;