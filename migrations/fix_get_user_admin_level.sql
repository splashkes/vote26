-- Fix get_user_admin_level function to look in correct table

-- Drop existing functions
DROP FUNCTION IF EXISTS get_user_admin_level(uuid, uuid, varchar);
DROP FUNCTION IF EXISTS get_user_admin_level(uuid, text);

-- Create the correct function
CREATE OR REPLACE FUNCTION get_user_admin_level(
  p_event_id UUID,
  p_phone TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Look up admin level in event_admins table, not people table
  RETURN (
    SELECT admin_level 
    FROM event_admins 
    WHERE event_id = p_event_id 
    AND phone = p_phone
    LIMIT 1
  );
END;
$$;