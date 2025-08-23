-- Update DELETE policy for round_contestants to allow all event admins to delete

DROP POLICY IF EXISTS "Event admins can delete round contestants" ON round_contestants;

-- Allow all event admins to delete round contestants
CREATE POLICY "Event admins can delete round contestants" ON round_contestants
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM rounds r
            JOIN event_admins ea ON ea.event_id = r.event_id
            WHERE r.id = round_contestants.round_id
            AND ea.phone = auth.jwt()->>'phone'
        )
        OR
        EXISTS (
            SELECT 1 FROM rounds r
            WHERE r.id = round_contestants.round_id
            AND check_event_admin_permission(r.event_id, 'voting')
        )
    );