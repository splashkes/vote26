-- Create function to get event rounds timeline data for analytics dashboard
-- This function returns round information with timing data for visual timeline charts

CREATE OR REPLACE FUNCTION get_event_rounds_timeline(p_event_id UUID)
RETURNS TABLE (
  round_number INT,
  round_start TIMESTAMPTZ,
  round_end TIMESTAMPTZ,
  auction_close TIMESTAMPTZ,
  is_finished BOOLEAN,
  duration_minutes INT,
  status TEXT
) AS $$
DECLARE
  event_start TIMESTAMPTZ;
  event_end TIMESTAMPTZ;
  auction_close_starts_at TIMESTAMPTZ;
  auction_close_round_delay INT;
  round_duration_minutes INT DEFAULT 20; -- Standard Art Battle round duration
BEGIN
  -- Get event timing information
  SELECT
    e.event_start_datetime,
    e.event_end_datetime,
    e.auction_close_starts_at,
    e.auction_close_round_delay
  INTO
    event_start,
    event_end,
    auction_close_starts_at,
    auction_close_round_delay
  FROM events e
  WHERE e.id = p_event_id;

  -- If no event found, return empty
  IF event_start IS NULL THEN
    RETURN;
  END IF;

  -- Set default auction close delay if not specified
  auction_close_round_delay := COALESCE(auction_close_round_delay, 5);

  -- Return rounds with calculated timing
  RETURN QUERY
  SELECT
    r.round_number,
    -- Calculate round start: event start + (round_number - 1) * 20 minutes
    (event_start + ((r.round_number - 1) * INTERVAL '20 minutes')) AS round_start,
    -- Calculate round end: round start + 20 minutes
    (event_start + (r.round_number * INTERVAL '20 minutes')) AS round_end,
    -- Use actual closing_time if set, otherwise calculate based on auction_close_starts_at + delay
    COALESCE(
      r.closing_time,
      CASE
        WHEN auction_close_starts_at IS NOT NULL
        THEN auction_close_starts_at + ((r.round_number - 1) * INTERVAL '1 minute' * auction_close_round_delay)
        ELSE (event_start + (r.round_number * INTERVAL '20 minutes') + INTERVAL '2 minutes')
      END
    ) AS auction_close,
    r.is_finished,
    round_duration_minutes AS duration_minutes,
    CASE
      WHEN r.is_finished THEN 'completed'
      WHEN NOW() >= (event_start + ((r.round_number - 1) * INTERVAL '20 minutes'))
           AND NOW() <= (event_start + (r.round_number * INTERVAL '20 minutes')) THEN 'active'
      WHEN NOW() < (event_start + ((r.round_number - 1) * INTERVAL '20 minutes')) THEN 'upcoming'
      ELSE 'completed'
    END AS status
  FROM rounds r
  WHERE r.event_id = p_event_id
  ORDER BY r.round_number;

END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_event_rounds_timeline(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_event_rounds_timeline(UUID) TO authenticated;