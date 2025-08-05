-- Function to check if a user has photo permissions for an event
-- This will be called by the Cloudflare Worker to validate uploads
CREATE OR REPLACE FUNCTION check_photo_permission(
    p_event_id UUID,
    p_user_phone TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_has_permission BOOLEAN := false;
BEGIN
    -- Check if user has photo, producer, or super admin level for this event
    SELECT EXISTS (
        SELECT 1 
        FROM event_admins ea
        JOIN people p ON ea.person_id = p.id
        WHERE ea.event_id = p_event_id
          AND p.phone_number = p_user_phone
          AND ea.admin_level IN ('photo', 'producer', 'super')
    ) INTO v_has_permission;
    
    RETURN v_has_permission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION check_photo_permission TO authenticated, anon;

-- Also create a simpler version that uses the current user's auth
CREATE OR REPLACE FUNCTION check_my_photo_permission(p_event_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_phone TEXT;
    v_has_permission BOOLEAN := false;
BEGIN
    -- Get the current user's phone
    SELECT phone INTO v_user_phone
    FROM auth.users
    WHERE id = auth.uid();
    
    IF v_user_phone IS NULL THEN
        RETURN false;
    END IF;
    
    -- Use the main function
    RETURN check_photo_permission(p_event_id, v_user_phone);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION check_my_photo_permission TO authenticated;