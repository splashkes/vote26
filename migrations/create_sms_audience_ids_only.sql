-- Create function to efficiently get only person IDs for RFM batch processing
-- This is much faster than getting full records when we only need IDs

CREATE OR REPLACE FUNCTION get_sms_audience_ids_only(
  p_city_ids UUID[] DEFAULT NULL,
  p_event_ids UUID[] DEFAULT NULL,
  p_recent_message_hours INTEGER DEFAULT 72,
  p_offset INTEGER DEFAULT 0,
  p_limit INTEGER DEFAULT 50000
)
RETURNS TABLE (
  id UUID
)
LANGUAGE SQL
SECURITY DEFINER
AS $$
  WITH filtered_people AS (
    SELECT DISTINCT p.id
    FROM people p
    WHERE 
      CASE
        -- If both city and event filters are provided
        WHEN p_city_ids IS NOT NULL AND p_event_ids IS NOT NULL THEN
          p.id IN (
            SELECT DISTINCT er.person_id 
            FROM event_registrations er
            JOIN events e ON er.event_id = e.id
            WHERE e.city_id = ANY(p_city_ids) AND e.id = ANY(p_event_ids)
          )
        -- If only city filter is provided
        WHEN p_city_ids IS NOT NULL THEN
          p.id IN (
            SELECT DISTINCT er.person_id 
            FROM event_registrations er
            JOIN events e ON er.event_id = e.id
            WHERE e.city_id = ANY(p_city_ids)
          )
        -- If only event filter is provided
        WHEN p_event_ids IS NOT NULL THEN
          p.id IN (
            SELECT DISTINCT er.person_id 
            FROM event_registrations er
            WHERE er.event_id = ANY(p_event_ids)
          )
        -- No filters - all people
        ELSE TRUE
      END
      -- Exclude people who got messages recently
      AND (p.phone IS NULL OR p.phone NOT IN (
        SELECT DISTINCT so.to_phone
        FROM sms_outbound so
        WHERE so.sent_at >= (NOW() - INTERVAL '1 hour' * p_recent_message_hours)
        AND so.to_phone IS NOT NULL
      ))
  )
  SELECT fp.id
  FROM filtered_people fp
  ORDER BY fp.id
  OFFSET p_offset
  LIMIT p_limit;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_sms_audience_ids_only(UUID[], UUID[], INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_sms_audience_ids_only(UUID[], UUID[], INTEGER, INTEGER, INTEGER) TO service_role;