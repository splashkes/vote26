-- Create function to efficiently check which people have cached RFM scores
-- Returns person_id and calculated_at for all people in the input array who have cached scores

CREATE OR REPLACE FUNCTION check_rfm_cache_batch(p_person_ids UUID[])
RETURNS TABLE (
  person_id UUID,
  calculated_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT person_id, calculated_at
  FROM rfm_score_cache
  WHERE person_id = ANY(p_person_ids);
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION check_rfm_cache_batch(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION check_rfm_cache_batch(UUID[]) TO authenticated;
