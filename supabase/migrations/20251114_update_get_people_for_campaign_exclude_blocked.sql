-- Update get_people_for_campaign to EXCLUDE blocked users
-- This ensures campaigns never include blocked users in recipient data

CREATE OR REPLACE FUNCTION get_people_for_campaign(person_ids UUID[])
RETURNS TABLE (
  id UUID,
  phone VARCHAR(20),
  phone_number TEXT,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  hash VARCHAR(100),
  message_blocked INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.phone,
    p.phone_number,
    p.first_name,
    p.last_name,
    p.hash,
    p.message_blocked
  FROM people p
  WHERE p.id = ANY(person_ids)
    AND (p.message_blocked IS NULL OR p.message_blocked = 0); -- EXCLUDE BLOCKED USERS
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_people_for_campaign(UUID[]) TO authenticated;
