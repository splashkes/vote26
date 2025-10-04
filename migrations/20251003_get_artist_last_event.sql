-- Get artist's most recent event with days since event
CREATE OR REPLACE FUNCTION get_artist_last_event(p_entry_id INTEGER)
RETURNS TABLE(
  event_eid TEXT,
  event_name TEXT,
  city_name TEXT,
  event_date TIMESTAMP WITH TIME ZONE,
  days_since_event INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.eid::TEXT,
    e.name::TEXT,
    c.name::TEXT,
    e.event_start_datetime,
    EXTRACT(DAY FROM (NOW() - e.event_start_datetime))::INTEGER
  FROM artist_profiles ap
  JOIN round_contestants rc ON ap.id = rc.artist_id
  JOIN rounds r ON rc.round_id = r.id
  JOIN events e ON r.event_id = e.id
  LEFT JOIN cities c ON e.city_id = c.id
  WHERE ap.entry_id = p_entry_id
  ORDER BY e.event_start_datetime DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION get_artist_last_event IS 'Returns most recent event info and days since event for an artist by entry_id';
