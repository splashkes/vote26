-- Fix admin check to properly use authenticated user's ID

DROP FUNCTION IF EXISTS check_event_admin_permission;
DROP FUNCTION IF EXISTS get_user_admin_level;

-- Create function that properly checks authenticated user
CREATE OR REPLACE FUNCTION check_event_admin_permission(
    p_event_id UUID,
    p_required_level TEXT,
    p_user_id UUID DEFAULT auth.uid(),
    p_user_phone VARCHAR(20) DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_user_phone VARCHAR(20);
BEGIN
    -- First check if authenticated user is in people table with admin phone
    IF auth.uid() IS NOT NULL THEN
        SELECT phone INTO v_user_phone
        FROM people
        WHERE id = auth.uid()
        LIMIT 1;
        
        -- Check if this phone matches admin phone
        IF v_user_phone = '+14163025959' THEN
            RETURN true;
        END IF;
    END IF;
    
    -- Check by provided phone parameter
    IF p_user_phone = '+14163025959' THEN
        RETURN true;
    END IF;
    
    -- Check email in admin_users table
    IF auth.jwt() ->> 'email' IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM admin_users 
            WHERE email = auth.jwt() ->> 'email'
            AND is_active = true
        ) THEN
            RETURN true;
        END IF;
    END IF;
    
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's admin level
CREATE OR REPLACE FUNCTION get_user_admin_level(
    p_event_id UUID,
    p_user_id UUID DEFAULT auth.uid(),
    p_user_phone VARCHAR(20) DEFAULT NULL
) RETURNS TEXT AS $$
DECLARE
    v_user_phone VARCHAR(20);
BEGIN
    -- Check authenticated user in people table
    IF auth.uid() IS NOT NULL THEN
        SELECT phone INTO v_user_phone
        FROM people
        WHERE id = auth.uid()
        LIMIT 1;
        
        IF v_user_phone = '+14163025959' THEN
            RETURN 'super';
        END IF;
    END IF;
    
    -- Check provided phone
    IF p_user_phone = '+14163025959' THEN
        RETURN 'super';
    END IF;
    
    -- Check email in admin_users
    IF auth.jwt() ->> 'email' IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM admin_users 
            WHERE email = auth.jwt() ->> 'email'
            AND is_active = true
        ) THEN
            RETURN 'super';
        END IF;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION check_event_admin_permission TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_admin_level TO authenticated;
GRANT EXECUTE ON FUNCTION check_event_admin_permission TO anon;
GRANT EXECUTE ON FUNCTION get_user_admin_level TO anon;

-- Test the functions with current auth context
SELECT 
    auth.uid() as current_user_id,
    check_event_admin_permission(NULL, 'voting') as is_admin,
    get_user_admin_level(NULL) as admin_level;