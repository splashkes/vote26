-- Create function to get bid history with proper name display
-- Bypasses RLS to show bid history with names formatted according to hierarchy:
-- 1: first name + last initial
-- 2: nickname  
-- 3: last 4 digits of phone number
-- 4: Anonymous (should never happen)

CREATE OR REPLACE FUNCTION get_bid_history_with_names(p_art_ids UUID[])
RETURNS TABLE(
  id UUID,
  art_id UUID,
  person_id UUID,
  amount NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE,
  display_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.art_id,
    b.person_id,
    b.amount,
    b.created_at,
    (CASE 
      -- 1: first name + last initial
      WHEN p.first_name IS NOT NULL AND p.first_name != '' THEN
        CASE 
          WHEN p.last_name IS NOT NULL AND p.last_name != '' THEN
            p.first_name || ' ' || LEFT(p.last_name, 1) || '.'
          ELSE
            p.first_name
        END
      -- 2: nickname
      WHEN p.nickname IS NOT NULL AND p.nickname != '' THEN
        p.nickname
      -- 3: full name (fallback - split and format)
      WHEN p.name IS NOT NULL AND p.name != '' THEN
        CASE 
          WHEN position(' ' in p.name) > 0 THEN
            split_part(p.name, ' ', 1) || ' ' || LEFT(split_part(p.name, ' ', -1), 1) || '.'
          ELSE
            p.name
        END
      -- 4: last 4 digits of phone number  
      WHEN COALESCE(p.phone, p.phone_number, p.auth_phone) IS NOT NULL THEN
        'User ' || RIGHT(regexp_replace(COALESCE(p.phone, p.phone_number, p.auth_phone), '[^0-9]', '', 'g'), 4)
      -- 5: Anonymous (should never happen)
      ELSE
        'Anonymous'
    END)::TEXT AS display_name
  FROM bids b
  JOIN people p ON b.person_id = p.id
  WHERE b.art_id = ANY(p_art_ids)
  ORDER BY b.created_at DESC;
END;
$$;

-- Grant access to authenticated users
GRANT EXECUTE ON FUNCTION get_bid_history_with_names(UUID[]) TO authenticated;