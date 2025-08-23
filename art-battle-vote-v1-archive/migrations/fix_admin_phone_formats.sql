-- Update admin check to handle phone without + prefix

DROP FUNCTION IF EXISTS check_event_admin_permission;
DROP FUNCTION IF EXISTS get_user_admin_level;

-- Create function that handles various phone formats
CREATE OR REPLACE FUNCTION check_event_admin_permission(
    p_event_id UUID,
    p_required_level TEXT,
    p_user_id UUID DEFAULT auth.uid(),
    p_user_phone VARCHAR(20) DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_user_phone VARCHAR(20);
    v_normalized_phone VARCHAR(20);
BEGIN
    -- First check if authenticated user is in people table with admin phone
    IF auth.uid() IS NOT NULL THEN
        SELECT phone INTO v_user_phone
        FROM people
        WHERE id = auth.uid()
        LIMIT 1;
        
        -- Normalize phone for comparison
        IF v_user_phone IS NOT NULL THEN
            v_normalized_phone := regexp_replace(v_user_phone, '^\+', '', 'g');
            IF v_normalized_phone IN ('14163025959', '4163025959') THEN
                RETURN true;
            END IF;
        END IF;
    END IF;
    
    -- Check by provided phone parameter (normalize it too)
    IF p_user_phone IS NOT NULL THEN
        v_normalized_phone := regexp_replace(p_user_phone, '^\+', '', 'g');
        IF v_normalized_phone IN ('14163025959', '4163025959') THEN
            RETURN true;
        END IF;
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
    v_normalized_phone VARCHAR(20);
BEGIN
    -- Check authenticated user in people table
    IF auth.uid() IS NOT NULL THEN
        SELECT phone INTO v_user_phone
        FROM people
        WHERE id = auth.uid()
        LIMIT 1;
        
        IF v_user_phone IS NOT NULL THEN
            v_normalized_phone := regexp_replace(v_user_phone, '^\+', '', 'g');
            IF v_normalized_phone IN ('14163025959', '4163025959') THEN
                RETURN 'super';
            END IF;
        END IF;
    END IF;
    
    -- Check provided phone (normalize it)
    IF p_user_phone IS NOT NULL THEN
        v_normalized_phone := regexp_replace(p_user_phone, '^\+', '', 'g');
        IF v_normalized_phone IN ('14163025959', '4163025959') THEN
            RETURN 'super';
        END IF;
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

-- Test with different phone formats
SELECT 
    check_event_admin_permission(NULL, 'voting', NULL, '14163025959') as without_plus,
    check_event_admin_permission(NULL, 'voting', NULL, '+14163025959') as with_plus,
    check_event_admin_permission(NULL, 'voting', NULL, '4163025959') as just_number;