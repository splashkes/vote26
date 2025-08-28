-- Create paginated function to efficiently calculate SMS audience with unlimited results
-- This version uses pagination to handle datasets larger than 100k

CREATE OR REPLACE FUNCTION get_sms_audience_paginated(
  p_city_ids UUID[] DEFAULT NULL,
  p_event_ids UUID[] DEFAULT NULL,
  p_recent_message_hours INTEGER DEFAULT 72,
  p_offset INTEGER DEFAULT 0,
  p_limit INTEGER DEFAULT 50000
)
RETURNS TABLE (
  id UUID,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(20),
  message_blocked INTEGER,
  has_rfm BOOLEAN,
  rfm_recency_score INTEGER,
  rfm_frequency_score INTEGER,
  rfm_monetary_score INTEGER,
  rfm_calculated_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE SQL
SECURITY DEFINER
AS $$
  WITH filtered_people AS (
    SELECT DISTINCT 
      p.id,
      p.first_name,
      p.last_name,
      p.phone,
      p.message_blocked
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
  ),
  total_count_cte AS (
    SELECT COUNT(*) as total_count FROM filtered_people
  )
  SELECT 
    fp.id,
    fp.first_name,
    fp.last_name,
    fp.phone,
    fp.message_blocked,
    (rsc.person_id IS NOT NULL) as has_rfm,
    rsc.recency_score as rfm_recency_score,
    rsc.frequency_score as rfm_frequency_score,
    rsc.monetary_score as rfm_monetary_score,
    rsc.calculated_at as rfm_calculated_at,
    tcc.total_count
  FROM filtered_people fp
  CROSS JOIN total_count_cte tcc
  LEFT JOIN rfm_score_cache rsc ON fp.id = rsc.person_id
    AND rsc.calculated_at >= (NOW() - INTERVAL '24 hours')
  ORDER BY fp.id
  OFFSET p_offset
  LIMIT p_limit;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_sms_audience_paginated(UUID[], UUID[], INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_sms_audience_paginated(UUID[], UUID[], INTEGER, INTEGER, INTEGER) TO service_role;