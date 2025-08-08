-- Create event_admins table for managing per-event admin permissions
CREATE TABLE IF NOT EXISTS event_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    phone VARCHAR(20) NOT NULL,
    admin_level VARCHAR(20) NOT NULL CHECK (admin_level IN ('super', 'producer', 'photo', 'voting')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    UNIQUE(event_id, phone)
);

-- Create indexes
CREATE INDEX idx_event_admins_event_id ON event_admins(event_id);
CREATE INDEX idx_event_admins_phone ON event_admins(phone);

-- Enable RLS
ALTER TABLE event_admins ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Allow authenticated users to read event_admins for events they're admin of
CREATE POLICY "Users can view event admins for events they admin" ON event_admins
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM event_admins ea 
            WHERE ea.event_id = event_admins.event_id 
            AND ea.phone = auth.jwt()->>'phone'
        )
    );

-- Allow super admins to manage event_admins
CREATE POLICY "Super admins can manage event admins" ON event_admins
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM event_admins ea 
            WHERE ea.event_id = event_admins.event_id 
            AND ea.phone = auth.jwt()->>'phone'
            AND ea.admin_level = 'super'
        )
    );

-- Update the admin check functions to use event_admins table
DROP FUNCTION IF EXISTS check_event_admin_permission;
DROP FUNCTION IF EXISTS get_user_admin_level;

-- Function to check if user has required permission level
CREATE OR REPLACE FUNCTION check_event_admin_permission(
    p_event_id UUID,
    p_required_level TEXT,
    p_user_id UUID DEFAULT auth.uid(),
    p_user_phone VARCHAR(20) DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_user_phone VARCHAR(20);
    v_user_level VARCHAR(20);
    v_normalized_phone VARCHAR(20);
BEGIN
    -- Get phone from authenticated user if not provided
    IF p_user_phone IS NULL AND auth.uid() IS NOT NULL THEN
        -- Try JWT first
        v_user_phone := auth.jwt()->>'phone';
        
        -- If not in JWT, get from people table
        IF v_user_phone IS NULL THEN
            SELECT phone INTO v_user_phone
            FROM people
            WHERE id = auth.uid()
            LIMIT 1;
        END IF;
    ELSE
        v_user_phone := p_user_phone;
    END IF;
    
    -- Normalize phone (remove + if present)
    IF v_user_phone IS NOT NULL THEN
        v_normalized_phone := regexp_replace(v_user_phone, '^\+', '', 'g');
        
        -- Check event_admins table
        SELECT admin_level INTO v_user_level
        FROM event_admins
        WHERE event_id = p_event_id
        AND (phone = v_user_phone OR phone = v_normalized_phone OR phone = '+' || v_normalized_phone)
        LIMIT 1;
        
        -- Check if user level meets required level
        IF v_user_level IS NOT NULL THEN
            CASE p_required_level
                WHEN 'voting' THEN
                    RETURN v_user_level IN ('voting', 'photo', 'producer', 'super');
                WHEN 'photo' THEN
                    RETURN v_user_level IN ('photo', 'producer', 'super');
                WHEN 'producer' THEN
                    RETURN v_user_level IN ('producer', 'super');
                WHEN 'super' THEN
                    RETURN v_user_level = 'super';
                ELSE
                    RETURN FALSE;
            END CASE;
        END IF;
    END IF;
    
    RETURN FALSE;
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
    v_user_level VARCHAR(20);
    v_normalized_phone VARCHAR(20);
BEGIN
    -- Get phone from authenticated user if not provided
    IF p_user_phone IS NULL AND auth.uid() IS NOT NULL THEN
        -- Try JWT first
        v_user_phone := auth.jwt()->>'phone';
        
        -- If not in JWT, get from people table
        IF v_user_phone IS NULL THEN
            SELECT phone INTO v_user_phone
            FROM people
            WHERE id = auth.uid()
            LIMIT 1;
        END IF;
    ELSE
        v_user_phone := p_user_phone;
    END IF;
    
    -- Normalize phone
    IF v_user_phone IS NOT NULL THEN
        v_normalized_phone := regexp_replace(v_user_phone, '^\+', '', 'g');
        
        -- Get from event_admins table
        SELECT admin_level INTO v_user_level
        FROM event_admins
        WHERE event_id = p_event_id
        AND (phone = v_user_phone OR phone = v_normalized_phone OR phone = '+' || v_normalized_phone)
        LIMIT 1;
        
        RETURN v_user_level;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION check_event_admin_permission TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_admin_level TO authenticated;
GRANT EXECUTE ON FUNCTION check_event_admin_permission TO anon;
GRANT EXECUTE ON FUNCTION get_user_admin_level TO anon;

-- Insert a test admin for your phone number
-- You can remove this after testing
INSERT INTO event_admins (event_id, phone, admin_level)
SELECT id, '+14163025959', 'super'
FROM events
LIMIT 1;
EOF < /dev/null
