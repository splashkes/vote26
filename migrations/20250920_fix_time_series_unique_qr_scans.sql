-- Fix time series function to count unique QR scanners instead of total scans
-- This addresses the issue where people scanning multiple times inflated the numbers

CREATE OR REPLACE FUNCTION public.get_event_time_series(p_event_id uuid, p_interval_minutes integer DEFAULT 30)
RETURNS TABLE(time_bucket timestamp with time zone, qr_scans_cumulative bigint, votes_cumulative bigint, bids_cumulative bigint, qr_scans_interval bigint, votes_interval bigint, bids_interval bigint)
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
    -- Get QR scan data with person_id for deduplication
    qr_scan_data AS (
        SELECT
            pqs.created_at,
            pqs.person_id
        FROM people_qr_scans pqs
        WHERE pqs.event_id = p_event_id
    ),
    -- Get votes data
    vote_data AS (
        SELECT
            v.created_at
        FROM votes v
        WHERE v.event_id = p_event_id
    ),
    -- Get bids data
    bid_data AS (
        SELECT
            b.created_at
        FROM bids b
        JOIN art a ON b.art_id = a.id
        WHERE a.event_id = p_event_id
    ),
    interval_stats AS (
        SELECT
            ti.interval_start,
            -- Interval counts - COUNT DISTINCT for QR scans to get unique people
            (SELECT COUNT(DISTINCT qsd.person_id)
             FROM qr_scan_data qsd
             WHERE qsd.created_at BETWEEN ti.interval_start AND ti.interval_start + (p_interval_minutes || ' minutes')::interval
            ) as qr_interval,
            (SELECT COUNT(*)
             FROM vote_data vd
             WHERE vd.created_at BETWEEN ti.interval_start AND ti.interval_start + (p_interval_minutes || ' minutes')::interval
            ) as votes_interval,
            (SELECT COUNT(*)
             FROM bid_data bd
             WHERE bd.created_at BETWEEN ti.interval_start AND ti.interval_start + (p_interval_minutes || ' minutes')::interval
            ) as bids_interval,
            -- Cumulative counts (up to end of this interval) - COUNT DISTINCT for QR scans
            (SELECT COUNT(DISTINCT qsd.person_id)
             FROM qr_scan_data qsd
             WHERE qsd.created_at <= ti.interval_start + (p_interval_minutes || ' minutes')::interval
            ) as qr_cumulative,
            (SELECT COUNT(*)
             FROM vote_data vd
             WHERE vd.created_at <= ti.interval_start + (p_interval_minutes || ' minutes')::interval
            ) as votes_cumulative,
            (SELECT COUNT(*)
             FROM bid_data bd
             WHERE bd.created_at <= ti.interval_start + (p_interval_minutes || ' minutes')::interval
            ) as bids_cumulative
        FROM time_intervals ti
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