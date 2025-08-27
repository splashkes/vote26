-- Create RPC function to get current user's admin info
-- This replaces direct table queries that fail due to RLS policies

CREATE OR REPLACE FUNCTION get_current_user_admin_info()
RETURNS TABLE (
  id UUID,
  email TEXT,
  level TEXT,
  active BOOLEAN,
  created_at TIMESTAMPTZ,
  cities_access TEXT[]
)
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT 
    au.id,
    au.email,
    au.level,
    au.active,
    au.created_at,
    au.cities_access
  FROM abhq_admin_users au
  WHERE au.user_id = auth.uid()
    AND au.active = true;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_current_user_admin_info() TO authenticated;
GRANT EXECUTE ON FUNCTION get_current_user_admin_info() TO anon;

-- Also create a simpler function to check if current user is any kind of admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM abhq_admin_users
    WHERE user_id = auth.uid()
    AND active = true
  );
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin() TO anon;