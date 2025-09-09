-- Create RPC function to set round timer with proper permissions
CREATE OR REPLACE FUNCTION set_round_timer(
  p_round_id UUID,
  p_closing_time TIMESTAMPTZ
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update the round's closing_time
  UPDATE rounds 
  SET 
    closing_time = p_closing_time,
    updated_at = NOW()
  WHERE id = p_round_id;
  
  -- Verify the update was successful
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Round with ID % not found', p_round_id;
  END IF;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION set_round_timer(UUID, TIMESTAMPTZ) TO authenticated;