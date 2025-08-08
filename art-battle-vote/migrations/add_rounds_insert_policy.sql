-- Add INSERT policy for rounds table to allow event admins to create rounds

-- First, let's check if the policy already exists and drop it if so
DROP POLICY IF EXISTS "Event admins can insert rounds" ON rounds;

-- Create policy to allow event admins to insert rounds
CREATE POLICY "Event admins can insert rounds" ON rounds
    FOR INSERT 
    TO authenticated
    WITH CHECK (
        -- Check if user is an admin for this event
        EXISTS (
            SELECT 1 FROM event_admins
            WHERE event_id = rounds.event_id
            AND phone = auth.jwt()->>'phone'
        )
        OR
        -- Also check using the RPC function we created
        check_event_admin_permission(event_id, 'voting')
    );

-- Also add UPDATE and DELETE policies for completeness
DROP POLICY IF EXISTS "Event admins can update rounds" ON rounds;
CREATE POLICY "Event admins can update rounds" ON rounds
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM event_admins
            WHERE event_id = rounds.event_id
            AND phone = auth.jwt()->>'phone'
        )
        OR
        check_event_admin_permission(event_id, 'voting')
    );

DROP POLICY IF EXISTS "Event admins can delete rounds" ON rounds;
CREATE POLICY "Event admins can delete rounds" ON rounds
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM event_admins
            WHERE event_id = rounds.event_id
            AND phone = auth.jwt()->>'phone'
            AND admin_level IN ('super', 'producer')
        )
        OR
        check_event_admin_permission(event_id, 'producer')
    );