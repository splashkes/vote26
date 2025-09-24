-- Simple function to count recent contestants
CREATE OR REPLACE FUNCTION get_recent_contestants_count(days_back integer)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COUNT(DISTINCT rc.artist_id)::integer
  FROM round_contestants rc
  JOIN rounds r ON rc.round_id = r.id
  JOIN events e ON r.event_id = e.id
  WHERE e.event_start_datetime >= NOW() - (days_back || ' days')::INTERVAL;
$$;