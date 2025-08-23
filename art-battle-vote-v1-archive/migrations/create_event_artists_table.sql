-- Create event_artists table to track which artists are participating in an event
-- This is separate from round_contestants which tracks specific round/easel assignments

CREATE TABLE IF NOT EXISTS event_artists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'confirmed' CHECK (status IN ('invited', 'confirmed', 'declined', 'withdrawn')),
    added_by UUID REFERENCES auth.users(id),
    added_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    UNIQUE(event_id, artist_id)
);

-- Create indexes
CREATE INDEX idx_event_artists_event_id ON event_artists(event_id);
CREATE INDEX idx_event_artists_artist_id ON event_artists(artist_id);
CREATE INDEX idx_event_artists_status ON event_artists(status);

-- Enable RLS
ALTER TABLE event_artists ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Anyone can view confirmed artists for an event
CREATE POLICY "Anyone can view confirmed event artists" ON event_artists
    FOR SELECT
    USING (status = 'confirmed');

-- Event admins can view all artists (including invited/declined)
CREATE POLICY "Event admins can view all event artists" ON event_artists
    FOR SELECT
    TO authenticated
    USING (
        check_event_admin_permission(event_id, 'voting')
    );

-- Event admins can insert artists
CREATE POLICY "Event admins can add event artists" ON event_artists
    FOR INSERT
    TO authenticated
    WITH CHECK (
        check_event_admin_permission(event_id, 'voting')
    );

-- Event admins can update artists
CREATE POLICY "Event admins can update event artists" ON event_artists
    FOR UPDATE
    TO authenticated
    USING (
        check_event_admin_permission(event_id, 'voting')
    );

-- Event admins can delete artists
CREATE POLICY "Event admins can delete event artists" ON event_artists
    FOR DELETE
    TO authenticated
    USING (
        check_event_admin_permission(event_id, 'voting')
    );

-- Migrate existing data from round_contestants to event_artists
-- This finds all unique artist/event combinations
INSERT INTO event_artists (event_id, artist_id, status, added_at)
SELECT DISTINCT 
    r.event_id,
    rc.artist_id,
    'confirmed' as status,
    MIN(rc.created_at) as added_at
FROM round_contestants rc
JOIN rounds r ON rc.round_id = r.id
WHERE rc.artist_id IS NOT NULL
GROUP BY r.event_id, rc.artist_id
ON CONFLICT (event_id, artist_id) DO NOTHING;

-- Add a comment explaining the table's purpose
COMMENT ON TABLE event_artists IS 'Tracks which artists are participating in an event, independent of round/easel assignments';