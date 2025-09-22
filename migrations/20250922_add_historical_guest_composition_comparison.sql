-- Historical Guest Composition Comparison Functions
-- For comparing current event guest composition with city and global averages

-- Function to get historical guest composition averages for last 10 events in same city
CREATE OR REPLACE FUNCTION public.get_city_guest_composition_average(p_event_id uuid)
RETURNS TABLE (
    guest_category text,
    avg_guest_pct numeric
)
LANGUAGE plpgsql
AS $function$
DECLARE
    event_venue text;
BEGIN
    -- Get the venue/city for the current event
    SELECT venue INTO event_venue
    FROM events
    WHERE id = p_event_id;

    -- If no venue found, return empty
    IF event_venue IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH recent_city_events AS (
        SELECT e.id
        FROM events e
        WHERE e.venue = event_venue
          AND e.id != p_event_id
          AND e.event_start_datetime IS NOT NULL
        ORDER BY e.event_start_datetime DESC
        LIMIT 10
    ),
    city_compositions AS (
        SELECT
            rce.id as event_id,
            comp.*
        FROM recent_city_events rce
        CROSS JOIN LATERAL (
            SELECT * FROM get_event_guest_composition(rce.id)
        ) comp
    )
    SELECT
        cc.guest_category::text,
        AVG(cc.guest_pct)::numeric as avg_guest_pct
    FROM city_compositions cc
    GROUP BY cc.guest_category
    ORDER BY
        CASE cc.guest_category
            WHEN 'QR Scan (New)' THEN 1
            WHEN 'QR Scan (Return)' THEN 2
            WHEN 'Online (New)' THEN 3
            WHEN 'Online (Return)' THEN 4
            ELSE 5
        END;
END;
$function$;

-- Function to get historical guest composition averages for last 10 events globally
CREATE OR REPLACE FUNCTION public.get_global_guest_composition_average(p_event_id uuid)
RETURNS TABLE (
    guest_category text,
    avg_guest_pct numeric
)
LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    WITH recent_global_events AS (
        SELECT e.id
        FROM events e
        WHERE e.id != p_event_id
          AND e.event_start_datetime IS NOT NULL
        ORDER BY e.event_start_datetime DESC
        LIMIT 10
    ),
    global_compositions AS (
        SELECT
            rge.id as event_id,
            comp.*
        FROM recent_global_events rge
        CROSS JOIN LATERAL (
            SELECT * FROM get_event_guest_composition(rge.id)
        ) comp
    )
    SELECT
        gc.guest_category::text,
        AVG(gc.guest_pct)::numeric as avg_guest_pct
    FROM global_compositions gc
    GROUP BY gc.guest_category
    ORDER BY
        CASE gc.guest_category
            WHEN 'QR Scan (New)' THEN 1
            WHEN 'QR Scan (Return)' THEN 2
            WHEN 'Online (New)' THEN 3
            WHEN 'Online (Return)' THEN 4
            ELSE 5
        END;
END;
$function$;

-- Combined function to get current, city average, and global average in one call
CREATE OR REPLACE FUNCTION public.get_guest_composition_with_comparisons(p_event_id uuid)
RETURNS TABLE (
    guest_category text,
    current_pct numeric,
    city_avg_pct numeric,
    global_avg_pct numeric
)
LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    WITH current_composition AS (
        SELECT
            gc.guest_category,
            gc.guest_pct as current_pct
        FROM get_event_guest_composition(p_event_id) gc
    ),
    city_averages AS (
        SELECT
            ca.guest_category,
            ca.avg_guest_pct as city_avg_pct
        FROM get_city_guest_composition_average(p_event_id) ca
    ),
    global_averages AS (
        SELECT
            ga.guest_category,
            ga.avg_guest_pct as global_avg_pct
        FROM get_global_guest_composition_average(p_event_id) ga
    )
    SELECT
        COALESCE(cc.guest_category, ca.guest_category, ga.guest_category)::text,
        COALESCE(cc.current_pct, 0)::numeric,
        COALESCE(ca.city_avg_pct, 0)::numeric,
        COALESCE(ga.global_avg_pct, 0)::numeric
    FROM current_composition cc
    FULL OUTER JOIN city_averages ca ON cc.guest_category = ca.guest_category
    FULL OUTER JOIN global_averages ga ON COALESCE(cc.guest_category, ca.guest_category) = ga.guest_category
    ORDER BY
        CASE COALESCE(cc.guest_category, ca.guest_category, ga.guest_category)
            WHEN 'QR Scan (New)' THEN 1
            WHEN 'QR Scan (Return)' THEN 2
            WHEN 'Online (New)' THEN 3
            WHEN 'Online (Return)' THEN 4
            ELSE 5
        END;
END;
$function$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_city_guest_composition_average(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_global_guest_composition_average(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_guest_composition_with_comparisons(UUID) TO authenticated;

-- Comments
COMMENT ON FUNCTION get_city_guest_composition_average IS 'Get average guest composition for last 10 events in same city';
COMMENT ON FUNCTION get_global_guest_composition_average IS 'Get average guest composition for last 10 events globally';
COMMENT ON FUNCTION get_guest_composition_with_comparisons IS 'Get current event guest composition with city and global averages for comparison';