-- RPC function to get email queue statistics for an event
CREATE OR REPLACE FUNCTION public.get_email_queue_stats(p_event_eid TEXT)
RETURNS TABLE (
    status TEXT,
    count BIGINT,
    event_eid TEXT,
    event_name TEXT,
    city_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(eq.status, 'none'::TEXT) as status,
        COALESCE(COUNT(eq.id), 0) as count,
        e.eid as event_eid,
        e.name as event_name,
        c.name as city_name
    FROM events e
    LEFT JOIN cities c ON e.city_id = c.id
    LEFT JOIN artist_payment_email_queue eq ON eq.event_id = e.id
    WHERE e.eid = p_event_eid
    GROUP BY eq.status, e.eid, e.name, c.name
    ORDER BY 
        CASE eq.status
            WHEN 'draft' THEN 1
            WHEN 'ready_for_review' THEN 2
            WHEN 'approved' THEN 3
            WHEN 'sent' THEN 4
            WHEN 'failed' THEN 5
            ELSE 6
        END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_email_queue_stats(TEXT) TO authenticated, service_role;