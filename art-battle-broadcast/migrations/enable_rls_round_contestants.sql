-- Enable RLS on round_contestants table
ALTER TABLE round_contestants ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read round contestants (for voting)
CREATE POLICY "Anyone can view round contestants" ON round_contestants
    FOR SELECT
    USING (true);

-- Allow event admins to insert round contestants
CREATE POLICY "Event admins can insert round contestants" ON round_contestants
    FOR INSERT
    TO authenticated
    WITH CHECK (
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

-- Allow event admins to update round contestants
CREATE POLICY "Event admins can update round contestants" ON round_contestants
    FOR UPDATE
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

-- Allow event admins (producer level) to delete round contestants
CREATE POLICY "Event admins can delete round contestants" ON round_contestants
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM rounds r
            JOIN event_admins ea ON ea.event_id = r.event_id
            WHERE r.id = round_contestants.round_id
            AND ea.phone = auth.jwt()->>'phone'
            AND ea.admin_level IN ('super', 'producer')
        )
        OR
        EXISTS (
            SELECT 1 FROM rounds r
            WHERE r.id = round_contestants.round_id
            AND check_event_admin_permission(r.event_id, 'producer')
        )
    );