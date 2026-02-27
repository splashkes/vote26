-- Update get_events_for_city_all to include ALL 4 sources: registrations, QR scans, votes, and bids
-- This ensures event people counts match the SMS audience counts

CREATE OR REPLACE FUNCTION get_events_for_city_all(p_city_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  eid TEXT,
  event_start_datetime TIMESTAMPTZ,
  people_count BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.name,
    e.eid::TEXT,
    e.event_start_datetime,
    COUNT(DISTINCT people.person_id) as people_count
  FROM events e
  LEFT JOIN LATERAL (
    -- Get people from registrations
    SELECT er.person_id
    FROM event_registrations er
    WHERE er.event_id = e.id

    UNION

    -- Get people from QR scans
    SELECT pqs.person_id
    FROM people_qr_scans pqs
    WHERE pqs.event_id = e.id
    AND pqs.is_valid = true

    UNION

    -- Get people from votes
    SELECT v.person_id
    FROM votes v
    WHERE v.event_id = e.id
    AND v.person_id IS NOT NULL

    UNION

    -- Get people from bids (join through art table)
    SELECT b.person_id
    FROM bids b
    JOIN art a ON b.art_id = a.id
    WHERE a.event_id = e.id
    AND b.person_id IS NOT NULL
  ) people ON true
  WHERE e.city_id = p_city_id
  GROUP BY e.id, e.name, e.eid, e.event_start_datetime
  ORDER BY e.event_start_datetime DESC;
END;
$$;
