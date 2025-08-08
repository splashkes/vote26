-- Fix infinite recursion in event_admins RLS policies

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view event admins for events they admin" ON event_admins;
DROP POLICY IF EXISTS "Super admins can manage event admins" ON event_admins;

-- Create new policies that don't cause recursion

-- Allow authenticated users to view event_admins if their phone matches
CREATE POLICY "Users can view their own admin records" ON event_admins
    FOR SELECT
    TO authenticated
    USING (
        phone = auth.jwt()->>'phone'
        OR phone = (SELECT phone FROM people WHERE id = auth.uid() LIMIT 1)
    );

-- Allow super admins to insert new admin records
-- Check is done via the function instead of recursive query
CREATE POLICY "Super admins can insert event admins" ON event_admins
    FOR INSERT
    TO authenticated
    WITH CHECK (
        check_event_admin_permission(event_id, 'super')
    );

-- Allow super admins to update admin records
CREATE POLICY "Super admins can update event admins" ON event_admins
    FOR UPDATE
    TO authenticated
    USING (
        check_event_admin_permission(event_id, 'super')
    );

-- Allow super admins to delete admin records
CREATE POLICY "Super admins can delete event admins" ON event_admins
    FOR DELETE
    TO authenticated
    USING (
        check_event_admin_permission(event_id, 'super')
    );

-- Also update the rounds policies to avoid potential recursion
DROP POLICY IF EXISTS "Event admins can insert rounds" ON rounds;

CREATE POLICY "Event admins can insert rounds" ON rounds
    FOR INSERT 
    TO authenticated
    WITH CHECK (
        check_event_admin_permission(event_id, 'voting')
    );

-- Update round_contestants policies as well
DROP POLICY IF EXISTS "Event admins can insert round contestants" ON round_contestants;

CREATE POLICY "Event admins can insert round contestants" ON round_contestants
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM rounds r
            WHERE r.id = round_contestants.round_id
            AND check_event_admin_permission(r.event_id, 'voting')
        )
    );

DROP POLICY IF EXISTS "Event admins can update round contestants" ON round_contestants;

CREATE POLICY "Event admins can update round contestants" ON round_contestants
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM rounds r
            WHERE r.id = round_contestants.round_id
            AND check_event_admin_permission(r.event_id, 'voting')
        )
    );

DROP POLICY IF EXISTS "Event admins can delete round contestants" ON round_contestants;

CREATE POLICY "Event admins can delete round contestants" ON round_contestants
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM rounds r
            WHERE r.id = round_contestants.round_id
            AND check_event_admin_permission(r.event_id, 'voting')
        )
    );