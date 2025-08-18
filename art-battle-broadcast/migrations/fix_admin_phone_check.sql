-- Update admin check functions to handle phone number formats better

-- Drop existing functions
DROP FUNCTION IF EXISTS check_event_admin_permission;
DROP FUNCTION IF EXISTS get_user_admin_level;

-- Create improved function to check admin permissions
CREATE OR REPLACE FUNCTION check_event_admin_permission(
    p_event_id UUID,
    p_required_level TEXT,
    p_user_id UUID DEFAULT auth.uid(),
    p_user_phone VARCHAR(20) DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_clean_phone VARCHAR(20);
BEGIN
    -- First check if user is authenticated and has email in admin_users
    IF auth.jwt() ->> 'email' IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM admin_users 
            WHERE email = auth.jwt() ->> 'email'
            AND is_active = true
        ) THEN
            RETURN true;
        END IF;
    END IF;
    
    -- Check by phone from JWT metadata
    IF auth.jwt() -> 'user_metadata' ->> 'phone' IS NOT NULL THEN
        v_clean_phone := auth.jwt() -> 'user_metadata' ->> 'phone';
        -- Remove any non-digit characters for comparison
        v_clean_phone := regexp_replace(v_clean_phone, '[^0-9]', '', 'g');
        
        IF v_clean_phone IN ('14163025959', '4163025959') THEN
            RETURN true;
        END IF;
    END IF;
    
    -- Check by provided phone parameter
    IF p_user_phone IS NOT NULL THEN
        v_clean_phone := regexp_replace(p_user_phone, '[^0-9]', '', 'g');
        
        IF v_clean_phone IN ('14163025959', '4163025959') THEN
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
    v_clean_phone VARCHAR(20);
BEGIN
    -- Check if user has admin access via email
    IF auth.jwt() ->> 'email' IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM admin_users 
            WHERE email = auth.jwt() ->> 'email'
            AND is_active = true
        ) THEN
            RETURN 'super';
        END IF;
    END IF;
    
    -- Check by phone from JWT
    IF auth.jwt() -> 'user_metadata' ->> 'phone' IS NOT NULL THEN
        v_clean_phone := auth.jwt() -> 'user_metadata' ->> 'phone';
        v_clean_phone := regexp_replace(v_clean_phone, '[^0-9]', '', 'g');
        
        IF v_clean_phone IN ('14163025959', '4163025959') THEN
            RETURN 'super';
        END IF;
    END IF;
    
    -- Check by provided phone
    IF p_user_phone IS NOT NULL THEN
        v_clean_phone := regexp_replace(p_user_phone, '[^0-9]', '', 'g');
        
        IF v_clean_phone IN ('14163025959', '4163025959') THEN
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

-- Test query to check current user
SELECT 
    auth.jwt() ->> 'email' as user_email,
    auth.jwt() -> 'user_metadata' ->> 'phone' as user_phone,
    check_event_admin_permission(NULL, 'voting', NULL, NULL) as is_admin;