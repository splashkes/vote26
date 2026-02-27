-- Add votes and bids as sources for SMS audience IDs function
-- This is the optimized version that only returns person IDs for RFM processing

DROP FUNCTION IF EXISTS get_sms_audience_ids_only(UUID[], UUID[], INTEGER, INTEGER, INTEGER);

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
            SELECT DISTINCT person_id FROM (
              -- From event_registrations
              SELECT er.person_id
              FROM event_registrations er
              JOIN events e ON er.event_id = e.id
              WHERE e.city_id = ANY(p_city_ids) AND e.id = ANY(p_event_ids)

              UNION

              -- From QR scans
              SELECT pqs.person_id
              FROM people_qr_scans pqs
              JOIN events e ON pqs.event_id = e.id
              WHERE e.city_id = ANY(p_city_ids) AND e.id = ANY(p_event_ids)
              AND pqs.is_valid = true

              UNION

              -- From votes
              SELECT v.person_id
              FROM votes v
              JOIN events e ON v.event_id = e.id
              WHERE e.city_id = ANY(p_city_ids) AND e.id = ANY(p_event_ids)
              AND v.person_id IS NOT NULL

              UNION

              -- From bids (join through art table to get event)
              SELECT b.person_id
              FROM bids b
              JOIN art a ON b.art_id = a.id
              JOIN events e ON a.event_id = e.id
              WHERE e.city_id = ANY(p_city_ids) AND e.id = ANY(p_event_ids)
              AND b.person_id IS NOT NULL
            ) combined_sources
          )
        -- If only city filter is provided
        WHEN p_city_ids IS NOT NULL THEN
          p.id IN (
            SELECT DISTINCT person_id FROM (
              -- From event_registrations
              SELECT er.person_id
              FROM event_registrations er
              JOIN events e ON er.event_id = e.id
              WHERE e.city_id = ANY(p_city_ids)

              UNION

              -- From QR scans
              SELECT pqs.person_id
              FROM people_qr_scans pqs
              JOIN events e ON pqs.event_id = e.id
              WHERE e.city_id = ANY(p_city_ids)
              AND pqs.is_valid = true

              UNION

              -- From votes
              SELECT v.person_id
              FROM votes v
              JOIN events e ON v.event_id = e.id
              WHERE e.city_id = ANY(p_city_ids)
              AND v.person_id IS NOT NULL

              UNION

              -- From bids (join through art table to get event)
              SELECT b.person_id
              FROM bids b
              JOIN art a ON b.art_id = a.id
              JOIN events e ON a.event_id = e.id
              WHERE e.city_id = ANY(p_city_ids)
              AND b.person_id IS NOT NULL
            ) combined_sources
          )
        -- If only event filter is provided
        WHEN p_event_ids IS NOT NULL THEN
          p.id IN (
            SELECT DISTINCT person_id FROM (
              -- From event_registrations
              SELECT er.person_id
              FROM event_registrations er
              WHERE er.event_id = ANY(p_event_ids)

              UNION

              -- From QR scans
              SELECT pqs.person_id
              FROM people_qr_scans pqs
              WHERE pqs.event_id = ANY(p_event_ids)
              AND pqs.is_valid = true

              UNION

              -- From votes
              SELECT v.person_id
              FROM votes v
              WHERE v.event_id = ANY(p_event_ids)
              AND v.person_id IS NOT NULL

              UNION

              -- From bids (join through art table to get event)
              SELECT b.person_id
              FROM bids b
              JOIN art a ON b.art_id = a.id
              WHERE a.event_id = ANY(p_event_ids)
              AND b.person_id IS NOT NULL
            ) combined_sources
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
