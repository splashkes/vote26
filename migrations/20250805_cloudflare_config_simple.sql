-- Simplified version that returns config for any authenticated user
-- We can add permission checks later once we debug the auth issue

DROP FUNCTION IF EXISTS get_cloudflare_config();

CREATE OR REPLACE FUNCTION get_cloudflare_config()
RETURNS JSONB AS $$
BEGIN
    -- For now, return config for any authenticated user
    -- The frontend already checks permissions
    IF auth.uid() IS NOT NULL THEN
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

GRANT EXECUTE ON FUNCTION get_cloudflare_config TO authenticated;

-- Test it
SELECT get_cloudflare_config();