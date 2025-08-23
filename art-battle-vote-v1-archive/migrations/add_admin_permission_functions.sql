-- Add the missing permission check functions for event_admins

-- Create function to check admin permissions
CREATE OR REPLACE FUNCTION check_event_admin_permission(
    p_event_id UUID,
    p_required_level admin_level,
    p_user_id UUID DEFAULT auth.uid(),
    p_user_phone VARCHAR(20) DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_admin_level admin_level;
BEGIN
    -- Check by user ID first
    IF p_user_id IS NOT NULL THEN
        SELECT admin_level INTO v_admin_level
        FROM event_admins
        WHERE event_id = p_event_id
        AND person_id = p_user_id;
        
        IF FOUND THEN
            -- Check permission hierarchy
            RETURN CASE
                WHEN v_admin_level = 'super' THEN true
                WHEN v_admin_level = 'producer' AND p_required_level IN ('producer', 'photo', 'voting') THEN true
                WHEN v_admin_level = 'photo' AND p_required_level IN ('photo', 'voting') THEN true
                WHEN v_admin_level = 'voting' AND p_required_level = 'voting' THEN true
                ELSE false
            END;
        END IF;
    END IF;
    
    -- Check by phone if provided
    IF p_user_phone IS NOT NULL THEN
        SELECT admin_level INTO v_admin_level
        FROM event_admins
        WHERE event_id = p_event_id
        AND phone = p_user_phone;
        
        IF FOUND THEN
            -- Check permission hierarchy
            RETURN CASE
                WHEN v_admin_level = 'super' THEN true
                WHEN v_admin_level = 'producer' AND p_required_level IN ('producer', 'photo', 'voting') THEN true
                WHEN v_admin_level = 'photo' AND p_required_level IN ('photo', 'voting') THEN true
                WHEN v_admin_level = 'voting' AND p_required_level = 'voting' THEN true
                ELSE false
            END;
        END IF;
    END IF;
    
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's admin level for an event
CREATE OR REPLACE FUNCTION get_user_admin_level(
    p_event_id UUID,
    p_user_id UUID DEFAULT auth.uid(),
    p_user_phone VARCHAR(20) DEFAULT NULL
) RETURNS admin_level AS $$
DECLARE
    v_admin_level admin_level;
BEGIN
    -- Check by user ID first
    IF p_user_id IS NOT NULL THEN
        SELECT admin_level INTO v_admin_level
        FROM event_admins
        WHERE event_id = p_event_id
        AND person_id = p_user_id;
        
        IF FOUND THEN
            RETURN v_admin_level;
        END IF;
    END IF;
    
    -- Check by phone if provided
    IF p_user_phone IS NOT NULL THEN
        SELECT admin_level INTO v_admin_level
        FROM event_admins
        WHERE event_id = p_event_id
        AND phone = p_user_phone;
        
        IF FOUND THEN
            RETURN v_admin_level;
        END IF;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION check_event_admin_permission TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_admin_level TO authenticated;

-- Grant execute permissions to anon users (for RPC calls)
GRANT EXECUTE ON FUNCTION check_event_admin_permission TO anon;
GRANT EXECUTE ON FUNCTION get_user_admin_level TO anon;