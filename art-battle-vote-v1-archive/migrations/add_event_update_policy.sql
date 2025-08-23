-- Add UPDATE policy for events table to allow super admins to edit events

-- Drop existing UPDATE policy if it exists
DROP POLICY IF EXISTS "Super admins can update events" ON events;

-- Create new UPDATE policy that allows super admins to update events
CREATE POLICY "Super admins can update events" ON events
    FOR UPDATE
    TO authenticated
    USING (
        get_user_admin_level(id) = 'super'
    );