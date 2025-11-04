-- City Analytics Aggregation Functions
-- These functions perform SQL-level aggregation to avoid fetching all records
-- and hitting query limits. They return counts grouped by event_id.

-- Function to count registrations by event
CREATE OR REPLACE FUNCTION count_registrations_by_event(event_ids uuid[])
RETURNS TABLE(event_id uuid, count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT event_id, COUNT(*)::bigint as count
  FROM event_registrations
  WHERE event_id = ANY(event_ids)
  GROUP BY event_id;
$$;

-- Function to count votes by event
CREATE OR REPLACE FUNCTION count_votes_by_event(event_ids uuid[])
RETURNS TABLE(event_id uuid, count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT event_id, COUNT(*)::bigint as count
  FROM votes
  WHERE event_id = ANY(event_ids)
  GROUP BY event_id;
$$;

-- Function to count bids by event
CREATE OR REPLACE FUNCTION count_bids_by_event(event_ids uuid[])
RETURNS TABLE(event_id uuid, count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT a.event_id, COUNT(*)::bigint as count
  FROM bids b
  JOIN art a ON b.art_id = a.id
  WHERE a.event_id = ANY(event_ids)
  GROUP BY a.event_id;
$$;

-- Function to count QR scans by event
CREATE OR REPLACE FUNCTION count_qr_scans_by_event(event_ids uuid[])
RETURNS TABLE(event_id uuid, count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT event_id, COUNT(*)::bigint as count
  FROM people_qr_scans
  WHERE event_id = ANY(event_ids)
    AND is_valid = true
  GROUP BY event_id;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION count_registrations_by_event TO authenticated;
GRANT EXECUTE ON FUNCTION count_votes_by_event TO authenticated;
GRANT EXECUTE ON FUNCTION count_bids_by_event TO authenticated;
GRANT EXECUTE ON FUNCTION count_qr_scans_by_event TO authenticated;

-- Also grant to service_role for edge function usage
GRANT EXECUTE ON FUNCTION count_registrations_by_event TO service_role;
GRANT EXECUTE ON FUNCTION count_votes_by_event TO service_role;
GRANT EXECUTE ON FUNCTION count_bids_by_event TO service_role;
GRANT EXECUTE ON FUNCTION count_qr_scans_by_event TO service_role;
