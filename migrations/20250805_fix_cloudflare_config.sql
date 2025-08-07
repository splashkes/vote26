-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_cloudflare_config();
DROP FUNCTION IF EXISTS has_cloudflare_access();

-- Create function to get Cloudflare configuration
CREATE OR REPLACE FUNCTION get_cloudflare_config()
RETURNS JSONB AS $$
DECLARE
    v_user_phone TEXT;
    v_has_permission BOOLEAN := false;
BEGIN
    -- Get the current user's phone
    SELECT phone INTO v_user_phone
    FROM auth.users
    WHERE id = auth.uid();
    
    -- Check if user has photo permissions (photo, producer, or super)
    SELECT EXISTS (
        SELECT 1 
        FROM event_admins ea
        JOIN people p ON ea.person_id = p.id
        WHERE p.phone_number = v_user_phone
          AND ea.admin_level IN ('photo', 'producer', 'super')
        LIMIT 1
    ) INTO v_has_permission;
    
    -- Only return config if user has permissions
    IF v_has_permission THEN
        RETURN jsonb_build_object(
            'accountId', '8679deebf60af4e83f621a3173b3f2a4',
            'accountHash', 'IGZfH_Pl-6S6csykNnXNJw',
            'deliveryUrl', 'https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw',
            'uploadUrl', 'https://api.cloudflare.com/client/v4/accounts/8679deebf60af4e83f621a3173b3f2a4/images/v1'
        );
    ELSE
        RETURN NULL;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_cloudflare_config TO authenticated;

-- Also create a simpler check function
CREATE OR REPLACE FUNCTION has_cloudflare_access()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN get_cloudflare_config() IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION has_cloudflare_access TO authenticated;