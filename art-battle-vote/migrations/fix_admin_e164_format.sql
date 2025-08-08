-- Update admin check to properly handle E.164 format

DROP FUNCTION IF EXISTS check_event_admin_permission;
DROP FUNCTION IF EXISTS get_user_admin_level;

-- Create function with proper E.164 phone checking
CREATE OR REPLACE FUNCTION check_event_admin_permission(
    p_event_id UUID,
    p_required_level TEXT,
    p_user_id UUID DEFAULT auth.uid(),
    p_user_phone VARCHAR(20) DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    -- Check if user email is in admin_users table
    IF auth.jwt() ->> 'email' IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM admin_users 
            WHERE email = auth.jwt() ->> 'email'
            AND is_active = true
        ) THEN
            RETURN true;
        END IF;
    END IF;
    
    -- Check by phone from JWT metadata (E.164 format)
    IF auth.jwt() -> 'user_metadata' ->> 'phone' = '+14163025959' THEN
        RETURN true;
    END IF;
    
    -- Check by provided phone parameter (E.164 format)
    IF p_user_phone = '+14163025959' THEN
        RETURN true;
    END IF;
    
    -- Also check people table for admin by auth.uid()
    IF auth.uid() IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM people 
            WHERE id = auth.uid() 
            AND phone = '+14163025959'
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
BEGIN
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
    
    -- Check phone from JWT (E.164 format)
    IF auth.jwt() -> 'user_metadata' ->> 'phone' = '+14163025959' THEN
        RETURN 'super';
    END IF;
    
    -- Check provided phone (E.164 format)
    IF p_user_phone = '+14163025959' THEN
        RETURN 'super';
    END IF;
    
    -- Check people table
    IF auth.uid() IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM people 
            WHERE id = auth.uid() 
            AND phone = '+14163025959'
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

-- Debug: Check current auth status
SELECT 
    auth.uid() as user_id,
    auth.jwt() ->> 'email' as user_email,
    auth.jwt() -> 'user_metadata' ->> 'phone' as user_phone,
    check_event_admin_permission(NULL, 'voting', NULL, '+14163025959') as is_admin_with_phone,
    check_event_admin_permission(NULL, 'voting', NULL, NULL) as is_admin_no_phone;