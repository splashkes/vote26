-- Simple admin check functions that return true for all authenticated users for now
-- This prevents the 404 errors while we implement proper admin system

-- Create function to check admin permissions (simplified)
CREATE OR REPLACE FUNCTION check_event_admin_permission(
    p_event_id UUID,
    p_required_level TEXT,
    p_user_id UUID DEFAULT auth.uid(),
    p_user_phone VARCHAR(20) DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    -- For now, check if user is in admin_users table by email
    IF auth.jwt() ->> 'email' IS NOT NULL THEN
        RETURN EXISTS (
            SELECT 1 FROM admin_users 
            WHERE email = auth.jwt() ->> 'email'
            AND is_active = true
        );
    END IF;
    
    -- Check by phone if available
    IF p_user_phone IS NOT NULL THEN
        -- Check hardcoded admin phones for now
        RETURN p_user_phone IN ('+14163025959');
    END IF;
    
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's admin level for an event (simplified)
CREATE OR REPLACE FUNCTION get_user_admin_level(
    p_event_id UUID,
    p_user_id UUID DEFAULT auth.uid(),
    p_user_phone VARCHAR(20) DEFAULT NULL
) RETURNS TEXT AS $$
BEGIN
    -- For now, return 'super' for admin users
    IF auth.jwt() ->> 'email' IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM admin_users 
            WHERE email = auth.jwt() ->> 'email'
            AND is_active = true
        ) THEN
            RETURN 'super';
        END IF;
    END IF;
    
    -- Check by phone
    IF p_user_phone IN ('+14163025959') THEN
        RETURN 'super';
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION check_event_admin_permission TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_admin_level TO authenticated;
GRANT EXECUTE ON FUNCTION check_event_admin_permission TO anon;
GRANT EXECUTE ON FUNCTION get_user_admin_level TO anon;