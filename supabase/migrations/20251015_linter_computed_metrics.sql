-- Linter Computed Metrics Functions
-- Created: 2025-10-15
-- Purpose: Provide computed metrics for event linter rules without denormalizing data

-- Function: Get confirmed artist count for an event
CREATE OR REPLACE FUNCTION get_event_confirmed_artists_count(p_event_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM artist_confirmations ac
    INNER JOIN events e ON ac.event_eid = e.eid
    WHERE e.id = p_event_id
      AND ac.confirmation_status = 'confirmed'
      AND ac.withdrawn_at IS NULL
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Get confirmed artist count by EID
CREATE OR REPLACE FUNCTION get_event_confirmed_artists_count_by_eid(p_eid TEXT)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM artist_confirmations
    WHERE event_eid = p_eid
      AND confirmation_status = 'confirmed'
      AND withdrawn_at IS NULL
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Get total applied artists count (including withdrawn)
CREATE OR REPLACE FUNCTION get_event_applied_artists_count(p_event_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM artist_confirmations ac
    INNER JOIN events e ON ac.event_eid = e.eid
    WHERE e.id = p_event_id
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Get total applied artists count by EID
CREATE OR REPLACE FUNCTION get_event_applied_artists_count_by_eid(p_eid TEXT)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM artist_confirmations
    WHERE event_eid = p_eid
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Get latest ticket revenue from Eventbrite cache
CREATE OR REPLACE FUNCTION get_event_ticket_revenue(p_event_id UUID)
RETURNS NUMERIC(10,2) AS $$
BEGIN
  RETURN (
    SELECT COALESCE(ticket_revenue, 0)
    FROM eventbrite_api_cache
    WHERE event_id = p_event_id
    ORDER BY fetched_at DESC
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Get latest ticket revenue by EID
CREATE OR REPLACE FUNCTION get_event_ticket_revenue_by_eid(p_eid TEXT)
RETURNS NUMERIC(10,2) AS $$
BEGIN
  RETURN (
    SELECT COALESCE(ticket_revenue, 0)
    FROM eventbrite_api_cache eac
    WHERE eac.eid = p_eid
    ORDER BY fetched_at DESC
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Get auction revenue (sum of final_price from art)
CREATE OR REPLACE FUNCTION get_event_auction_revenue(p_event_id UUID)
RETURNS NUMERIC(10,2) AS $$
BEGIN
  RETURN (
    SELECT COALESCE(SUM(final_price), 0)
    FROM art
    WHERE event_id = p_event_id
      AND final_price IS NOT NULL
      AND final_price > 0
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Get auction revenue by EID
CREATE OR REPLACE FUNCTION get_event_auction_revenue_by_eid(p_eid TEXT)
RETURNS NUMERIC(10,2) AS $$
BEGIN
  RETURN (
    SELECT COALESCE(SUM(a.final_price), 0)
    FROM art a
    INNER JOIN events e ON a.event_id = e.id
    WHERE e.eid = p_eid
      AND a.final_price IS NOT NULL
      AND a.final_price > 0
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Get total votes for an event
CREATE OR REPLACE FUNCTION get_event_total_votes(p_event_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM votes
    WHERE event_id = p_event_id
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Get total votes by EID
CREATE OR REPLACE FUNCTION get_event_total_votes_by_eid(p_eid TEXT)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM votes
    WHERE eid = p_eid
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Get ticket sales count (from Eventbrite cache)
CREATE OR REPLACE FUNCTION get_event_ticket_sales(p_event_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COALESCE(total_tickets_sold, 0)
    FROM eventbrite_api_cache
    WHERE event_id = p_event_id
    ORDER BY fetched_at DESC
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Get ticket sales count by EID
CREATE OR REPLACE FUNCTION get_event_ticket_sales_by_eid(p_eid TEXT)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COALESCE(total_tickets_sold, 0)
    FROM eventbrite_api_cache
    WHERE eid = p_eid
    ORDER BY fetched_at DESC
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Get previous event metrics (by city and date)
-- This finds the most recent event in the same city before the current event
CREATE OR REPLACE FUNCTION get_previous_event_metrics(p_event_id UUID)
RETURNS TABLE (
  prev_event_id UUID,
  prev_eid TEXT,
  prev_ticket_revenue NUMERIC(10,2),
  prev_auction_revenue NUMERIC(10,2),
  prev_total_votes INTEGER,
  prev_ticket_sales INTEGER
) AS $$
DECLARE
  v_city_id INTEGER;
  v_event_date TIMESTAMP;
BEGIN
  -- Get current event's city and date
  SELECT city_id, event_start_datetime INTO v_city_id, v_event_date
  FROM events
  WHERE id = p_event_id;

  -- Find previous event in same city
  RETURN QUERY
  WITH prev_event AS (
    SELECT id, eid
    FROM events
    WHERE city_id = v_city_id
      AND event_start_datetime < v_event_date
      AND event_start_datetime IS NOT NULL
    ORDER BY event_start_datetime DESC
    LIMIT 1
  )
  SELECT
    pe.id,
    pe.eid,
    get_event_ticket_revenue(pe.id),
    get_event_auction_revenue(pe.id),
    get_event_total_votes(pe.id),
    get_event_ticket_sales(pe.id)
  FROM prev_event pe;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_event_confirmed_artists_count TO authenticated;
GRANT EXECUTE ON FUNCTION get_event_confirmed_artists_count_by_eid TO authenticated;
GRANT EXECUTE ON FUNCTION get_event_applied_artists_count TO authenticated;
GRANT EXECUTE ON FUNCTION get_event_applied_artists_count_by_eid TO authenticated;
GRANT EXECUTE ON FUNCTION get_event_ticket_revenue TO authenticated;
GRANT EXECUTE ON FUNCTION get_event_ticket_revenue_by_eid TO authenticated;
GRANT EXECUTE ON FUNCTION get_event_auction_revenue TO authenticated;
GRANT EXECUTE ON FUNCTION get_event_auction_revenue_by_eid TO authenticated;
GRANT EXECUTE ON FUNCTION get_event_total_votes TO authenticated;
GRANT EXECUTE ON FUNCTION get_event_total_votes_by_eid TO authenticated;
GRANT EXECUTE ON FUNCTION get_event_ticket_sales TO authenticated;
GRANT EXECUTE ON FUNCTION get_event_ticket_sales_by_eid TO authenticated;
GRANT EXECUTE ON FUNCTION get_previous_event_metrics TO authenticated;

-- Comments
COMMENT ON FUNCTION get_event_confirmed_artists_count IS 'Returns count of confirmed (not withdrawn) artists for an event';
COMMENT ON FUNCTION get_event_applied_artists_count IS 'Returns total count of artist applications for an event (including withdrawn)';
COMMENT ON FUNCTION get_event_ticket_revenue IS 'Returns latest cached ticket revenue from Eventbrite API';
COMMENT ON FUNCTION get_event_auction_revenue IS 'Returns total auction revenue (sum of final prices) for an event';
COMMENT ON FUNCTION get_event_total_votes IS 'Returns total vote count for an event';
COMMENT ON FUNCTION get_event_ticket_sales IS 'Returns total tickets sold from Eventbrite cache';
COMMENT ON FUNCTION get_previous_event_metrics IS 'Returns metrics from the previous event in the same city, for comparison';
