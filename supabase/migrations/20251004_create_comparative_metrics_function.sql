-- Create function to get previous event metrics for comparison
-- Used by comparative lint rules (#37-#47)

CREATE OR REPLACE FUNCTION get_previous_event_metrics(
  p_event_id UUID
)
RETURNS TABLE(
  previous_event_id UUID,
  previous_event_eid CHARACTER VARYING(50),
  previous_event_name TEXT,
  previous_event_end_datetime TIMESTAMPTZ,
  ticket_revenue NUMERIC,
  auction_revenue NUMERIC,
  total_votes INTEGER,
  round1_votes INTEGER,
  round2_votes INTEGER,
  round3_votes INTEGER,
  qr_registrations INTEGER,
  online_registrations INTEGER
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_city_id UUID;
  v_event_end_datetime TIMESTAMPTZ;
BEGIN
  -- Get the city and end datetime of the current event
  SELECT city_id, event_end_datetime
  INTO v_city_id, v_event_end_datetime
  FROM events
  WHERE id = p_event_id;

  -- If event not found or city not set, return empty result
  IF v_city_id IS NULL THEN
    RETURN;
  END IF;

  -- Get the most recent previous event in the same city
  RETURN QUERY
  WITH prev_event AS (
    SELECT e.id, e.eid, e.name, e.event_end_datetime
    FROM events e
    WHERE e.city_id = v_city_id
      AND e.id != p_event_id
      AND e.event_end_datetime < COALESCE(v_event_end_datetime, NOW())
      AND e.event_end_datetime IS NOT NULL
    ORDER BY e.event_end_datetime DESC
    LIMIT 1
  ),
  prev_votes AS (
    SELECT
      pe.id as event_id,
      COUNT(v.id) as total_votes,
      COUNT(CASE WHEN v.round = 1 THEN 1 END) as round1_votes,
      COUNT(CASE WHEN v.round = 2 THEN 1 END) as round2_votes,
      COUNT(CASE WHEN v.round = 3 THEN 1 END) as round3_votes
    FROM prev_event pe
    LEFT JOIN art a ON a.event_id = pe.id
    LEFT JOIN votes v ON v.art_uuid = a.id
    GROUP BY pe.id
  ),
  prev_registrations AS (
    SELECT
      pe.id as event_id,
      COUNT(CASE WHEN er.registration_type = 'qr' THEN 1 END) as qr_regs,
      COUNT(CASE WHEN er.registration_type = 'online' THEN 1 END) as online_regs
    FROM prev_event pe
    LEFT JOIN event_registrations er ON er.event_id = pe.id
    GROUP BY pe.id
  ),
  prev_auction AS (
    SELECT
      pe.id as event_id,
      COALESCE(SUM(a.final_price), 0) as auction_revenue
    FROM prev_event pe
    LEFT JOIN art a ON a.event_id = pe.id
    WHERE a.status IN ('sold', 'paid')
    GROUP BY pe.id
  )
  SELECT
    pe.id,
    pe.eid,
    pe.name,
    pe.event_end_datetime,
    COALESCE(ebc.ticket_revenue, 0)::NUMERIC,
    COALESCE(pa.auction_revenue, 0)::NUMERIC,
    COALESCE(pv.total_votes, 0)::INTEGER,
    COALESCE(pv.round1_votes, 0)::INTEGER,
    COALESCE(pv.round2_votes, 0)::INTEGER,
    COALESCE(pv.round3_votes, 0)::INTEGER,
    COALESCE(pr.qr_regs, 0)::INTEGER,
    COALESCE(pr.online_regs, 0)::INTEGER
  FROM prev_event pe
  LEFT JOIN eventbrite_api_cache ebc ON ebc.event_id = pe.id
  LEFT JOIN prev_votes pv ON pv.event_id = pe.id
  LEFT JOIN prev_registrations pr ON pr.event_id = pe.id
  LEFT JOIN prev_auction pa ON pa.event_id = pe.id;
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION get_previous_event_metrics(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_previous_event_metrics(UUID) TO authenticated;

COMMENT ON FUNCTION get_previous_event_metrics(UUID) IS 'Returns metrics from the previous event in the same city for comparative analysis. Used by event linter comparative rules.';
