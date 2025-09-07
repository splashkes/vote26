-- Function to get events with high auction values
-- Calculates the sum of the highest bid per artwork for each event
CREATE OR REPLACE FUNCTION get_events_with_high_auction_value(
  min_total_value DECIMAL DEFAULT 500,
  limit_count INTEGER DEFAULT 10
)
RETURNS TABLE(
  event_id UUID,
  total_value DECIMAL,
  artwork_count BIGINT,
  event_date TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  WITH event_artwork_max_bids AS (
    -- Get the highest bid per artwork for each event
    SELECT 
      e.id as evt_id,
      e.event_start_datetime,
      a.id as artwork_id,
      COALESCE(MAX(b.amount), 0) as max_bid
    FROM events e
    LEFT JOIN art a ON e.id = a.event_id
    LEFT JOIN bids b ON a.id = b.art_id
    WHERE e.event_start_datetime < NOW() -- Only past events
      AND e.show_in_app = true
    GROUP BY e.id, e.event_start_datetime, a.id
  ),
  event_totals AS (
    -- Sum the max bids per event
    SELECT 
      evt_id,
      event_start_datetime,
      SUM(max_bid) as total_auction_value,
      COUNT(artwork_id) as total_artworks
    FROM event_artwork_max_bids
    GROUP BY evt_id, event_start_datetime
    HAVING SUM(max_bid) >= min_total_value
  )
  SELECT 
    et.evt_id,
    et.total_auction_value,
    et.total_artworks,
    et.event_start_datetime
  FROM event_totals et
  ORDER BY et.event_start_datetime DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;