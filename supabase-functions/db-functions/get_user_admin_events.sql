-- Get all events where user has admin permissions
-- Returns event_id, admin_level, and event_eid for caching

CREATE OR REPLACE FUNCTION get_user_admin_events(p_user_phone TEXT DEFAULT NULL)
RETURNS TABLE(event_id UUID, admin_level VARCHAR(20), event_eid VARCHAR(50)) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_phone_to_check TEXT;
BEGIN
    -- Use provided phone or get from authenticated user
    IF p_user_phone IS NOT NULL THEN
        user_phone_to_check := p_user_phone;
    ELSIF auth.uid() IS NOT NULL THEN
        SELECT phone INTO user_phone_to_check FROM auth.users WHERE id = auth.uid();
    ELSE
        RETURN; -- No phone available
    END IF;
    
    -- Return all events where user has admin permissions
    -- Handle both formats: with and without + prefix
    RETURN QUERY
    SELECT 
        ea.event_id,
        ea.admin_level,
        e.eid as event_eid
    FROM event_admins ea
    JOIN events e ON ea.event_id = e.id
    WHERE ea.phone = user_phone_to_check 
       OR ea.phone = '+' || user_phone_to_check
       OR ea.phone = ltrim(user_phone_to_check, '+')
    ORDER BY ea.admin_level, e.eid;
END;
$$;