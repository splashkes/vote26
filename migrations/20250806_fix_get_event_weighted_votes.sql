-- Fix get_event_weighted_votes to use art_uuid instead of art_id
CREATE OR REPLACE FUNCTION get_event_weighted_votes(
  p_event_id UUID,
  p_round INTEGER DEFAULT NULL
) RETURNS TABLE (
  art_id UUID,
  raw_vote_count BIGINT,
  weighted_vote_total NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.art_uuid as art_id,
    COUNT(*)::BIGINT as raw_vote_count,
    COALESCE(SUM(v.vote_factor), 0) as weighted_vote_total
  FROM votes v
  WHERE v.event_id = p_event_id
    AND v.art_uuid IS NOT NULL
    AND (p_round IS NULL OR v.round = p_round)
  GROUP BY v.art_uuid
  ORDER BY weighted_vote_total DESC;
END;
$$ LANGUAGE plpgsql STABLE;