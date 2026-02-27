-- Create RPC function to get all cities with event counts (including events with 0 people)
-- Uses all 4 sources: registrations, QR scans, votes, and bids
-- Unlike get_cities_with_event_people_counts, this does NOT filter by minimum people count

CREATE OR REPLACE FUNCTION get_cities_with_all_events()
RETURNS TABLE (
  city_id UUID,
  city_name TEXT,
  event_count BIGINT
)
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT
    c.id as city_id,
    c.name as city_name,
    COUNT(DISTINCT e.id) as event_count
  FROM cities c
  JOIN events e ON e.city_id = c.id
  GROUP BY c.id, c.name
  HAVING COUNT(DISTINCT e.id) > 0
  ORDER BY event_count DESC;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_cities_with_all_events() TO authenticated;
GRANT EXECUTE ON FUNCTION get_cities_with_all_events() TO service_role;
