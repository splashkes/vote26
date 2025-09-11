-- Create RPC function to get high-value events with latest artwork images for feed
DROP FUNCTION IF EXISTS get_high_value_event_recap(NUMERIC, INTEGER);
CREATE OR REPLACE FUNCTION get_high_value_event_recap(min_value NUMERIC DEFAULT 500, limit_count INTEGER DEFAULT 10)
RETURNS TABLE(
    event_id UUID,
    event_name TEXT,
    event_eid TEXT,
    event_venue TEXT,
    event_date TIMESTAMP WITH TIME ZONE,
    total_value NUMERIC,
    artwork_count BIGINT,
    currency_code TEXT,
    currency_symbol TEXT,
    latest_images JSONB
) AS $$
BEGIN
    RETURN QUERY
    WITH high_value_events AS (
        SELECT hvev.event_id, hvev.total_value, hvev.artwork_count, hvev.event_date
        FROM get_events_with_high_auction_value(min_value, limit_count) hvev
    ),
    latest_artwork_images AS (
        SELECT DISTINCT ON (a.id)
            e.id as event_id,
            CASE 
                WHEN mf.cloudflare_id IS NOT NULL THEN
                    'https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw/' || mf.cloudflare_id || '/public'
                ELSE
                    COALESCE(mf.compressed_url, mf.original_url)
            END as image_url,
            CASE 
                WHEN mf.cloudflare_id IS NOT NULL THEN
                    'https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw/' || mf.cloudflare_id || '/public'
                ELSE
                    COALESCE(mf.thumbnail_url, mf.compressed_url, mf.original_url)
            END as thumbnail_url
        FROM events e
        JOIN art a ON e.id = a.event_id
        JOIN art_media am ON a.id = am.art_id
        JOIN media_files mf ON am.media_id = mf.id
        WHERE e.id IN (SELECT hve_inner.event_id FROM high_value_events hve_inner)
        ORDER BY a.id, am.display_order DESC -- Get latest image per artwork
    )
    SELECT 
        e.id,
        e.name::TEXT,
        e.eid::TEXT,
        e.venue::TEXT,
        e.event_start_datetime,
        hve.total_value,
        hve.artwork_count,
        COALESCE(c.currency_code, 'USD')::TEXT,
        COALESCE(c.currency_symbol, '$')::TEXT,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'image_url', lai.image_url,
                    'thumbnail_url', lai.thumbnail_url
                )
            ) FILTER (WHERE lai.image_url IS NOT NULL),
            '[]'::jsonb
        ) as latest_images
    FROM high_value_events hve
    JOIN events e ON hve.event_id = e.id
    LEFT JOIN countries c ON e.country_id = c.id
    LEFT JOIN latest_artwork_images lai ON e.id = lai.event_id
    GROUP BY e.id, e.name, e.eid, e.venue, e.event_start_datetime, hve.total_value, hve.artwork_count, c.currency_code, c.currency_symbol
    ORDER BY hve.total_value DESC;
END;
$$ LANGUAGE plpgsql;