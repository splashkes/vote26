-- Function to get vote weight ranges for an event
CREATE OR REPLACE FUNCTION get_event_vote_ranges(
  p_event_id UUID
) RETURNS TABLE (
  art_id UUID,
  range_0_22 INTEGER,
  range_0_95 INTEGER,
  range_1_01 INTEGER,
  range_1_90 INTEGER,
  range_2_50 INTEGER,
  range_5_01 INTEGER,
  range_10_00 INTEGER,
  range_above_10 INTEGER,
  total_weight NUMERIC,
  total_votes INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.art_uuid as art_id,
    COUNT(CASE WHEN v.vote_factor <= 0.22 THEN 1 END)::INTEGER as range_0_22,
    COUNT(CASE WHEN v.vote_factor > 0.22 AND v.vote_factor <= 0.95 THEN 1 END)::INTEGER as range_0_95,
    COUNT(CASE WHEN v.vote_factor > 0.95 AND v.vote_factor <= 1.01 THEN 1 END)::INTEGER as range_1_01,
    COUNT(CASE WHEN v.vote_factor > 1.01 AND v.vote_factor <= 1.90 THEN 1 END)::INTEGER as range_1_90,
    COUNT(CASE WHEN v.vote_factor > 1.90 AND v.vote_factor <= 2.50 THEN 1 END)::INTEGER as range_2_50,
    COUNT(CASE WHEN v.vote_factor > 2.50 AND v.vote_factor <= 5.01 THEN 1 END)::INTEGER as range_5_01,
    COUNT(CASE WHEN v.vote_factor > 5.01 AND v.vote_factor <= 10.00 THEN 1 END)::INTEGER as range_10_00,
    COUNT(CASE WHEN v.vote_factor > 10.00 THEN 1 END)::INTEGER as range_above_10,
    COALESCE(SUM(v.vote_factor), 0) as total_weight,
    COUNT(*)::INTEGER as total_votes
  FROM votes v
  WHERE v.event_id = p_event_id
    AND v.art_uuid IS NOT NULL
  GROUP BY v.art_uuid
  ORDER BY total_weight DESC;
END;
$$ LANGUAGE plpgsql STABLE;