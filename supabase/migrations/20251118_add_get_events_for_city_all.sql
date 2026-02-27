-- Create RPC function to get all events for a city with people counts
-- Unlike get_events_with_people_counts_by_city, this does NOT filter out events with 0 people

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
  ) people ON true
  WHERE e.city_id = p_city_id
  GROUP BY e.id, e.name, e.eid, e.event_start_datetime
  ORDER BY e.event_start_datetime DESC;
END;
$$;
