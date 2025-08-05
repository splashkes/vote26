-- Add mask_name function if it doesn't exist

CREATE OR REPLACE FUNCTION mask_name(p_name TEXT) 
RETURNS TEXT AS $$
BEGIN
  IF p_name IS NULL OR length(p_name) < 2 THEN
    RETURN p_name;
  END IF;
  
  RETURN left(p_name, 1) || repeat('*', length(p_name) - 2) || right(p_name, 1);
END;
$$ LANGUAGE plpgsql IMMUTABLE;