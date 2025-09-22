-- Fix the time series function with proper aggregation
CREATE OR REPLACE FUNCTION public.get_event_time_series(
    p_event_id uuid,
    p_interval_minutes integer DEFAULT 30
)
RETURNS TABLE (
    time_bucket timestamptz,
    qr_scans_cumulative bigint,
    votes_cumulative bigint,
    bids_cumulative bigint,
    qr_scans_interval bigint,
    votes_interval bigint,
    bids_interval bigint
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
    -- Get all activity data with timestamps
    activity_data AS (
        SELECT
            pqs.created_at,
            'qr_scan' as activity_type
        FROM people_qr_scans pqs
        WHERE pqs.event_id = p_event_id

        UNION ALL

        SELECT
            v.created_at,
            'vote' as activity_type
        FROM votes v
        WHERE v.event_id = p_event_id

        UNION ALL

        SELECT
            b.created_at,
            'bid' as activity_type
        FROM bids b
        JOIN art a ON b.art_id = a.id
        WHERE a.event_id = p_event_id
    ),
    interval_stats AS (
        SELECT
            ti.interval_start,
            -- Interval counts
            COUNT(ad.created_at) FILTER (WHERE ad.activity_type = 'qr_scan'
                AND ad.created_at BETWEEN ti.interval_start AND ti.interval_start + (p_interval_minutes || ' minutes')::interval) as qr_interval,
            COUNT(ad.created_at) FILTER (WHERE ad.activity_type = 'vote'
                AND ad.created_at BETWEEN ti.interval_start AND ti.interval_start + (p_interval_minutes || ' minutes')::interval) as votes_interval,
            COUNT(ad.created_at) FILTER (WHERE ad.activity_type = 'bid'
                AND ad.created_at BETWEEN ti.interval_start AND ti.interval_start + (p_interval_minutes || ' minutes')::interval) as bids_interval,
            -- Cumulative counts (up to end of this interval)
            COUNT(ad.created_at) FILTER (WHERE ad.activity_type = 'qr_scan'
                AND ad.created_at <= ti.interval_start + (p_interval_minutes || ' minutes')::interval) as qr_cumulative,
            COUNT(ad.created_at) FILTER (WHERE ad.activity_type = 'vote'
                AND ad.created_at <= ti.interval_start + (p_interval_minutes || ' minutes')::interval) as votes_cumulative,
            COUNT(ad.created_at) FILTER (WHERE ad.activity_type = 'bid'
                AND ad.created_at <= ti.interval_start + (p_interval_minutes || ' minutes')::interval) as bids_cumulative
        FROM time_intervals ti
        LEFT JOIN activity_data ad ON ad.created_at >= event_start
        GROUP BY ti.interval_start
        ORDER BY ti.interval_start
    )
    SELECT
        iss.interval_start,
        iss.qr_cumulative::bigint,
        iss.votes_cumulative::bigint,
        iss.bids_cumulative::bigint,
        iss.qr_interval::bigint,
        iss.votes_interval::bigint,
        iss.bids_interval::bigint
    FROM interval_stats iss;
END;
$function$;