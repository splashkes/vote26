-- Create RPC function to get event admins with people data using LEFT JOIN
-- This handles cases where admin phone numbers don't exist in people table

CREATE OR REPLACE FUNCTION get_event_admins_with_people(p_event_id UUID)
RETURNS TABLE (
    id UUID,
    phone VARCHAR(20),
    admin_level VARCHAR(20),
    people JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ea.id,
        ea.phone,
        ea.admin_level,
        CASE 
            WHEN p.id IS NOT NULL THEN
                jsonb_build_object(
                    'id', p.id,
                    'first_name', p.first_name,
                    'last_name', p.last_name,
                    'name', p.name,
                    'nickname', p.nickname
                )
            ELSE NULL
        END as people
    FROM event_admins ea
    LEFT JOIN people p ON ea.phone = p.phone
    WHERE ea.event_id = p_event_id
    ORDER BY ea.admin_level DESC;
END;
$$;