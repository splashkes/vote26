-- Create artist_invites table
CREATE TABLE IF NOT EXISTS artist_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_profile_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    application_id UUID REFERENCES artist_applications(id) ON DELETE SET NULL,
    invited_by_admin UUID REFERENCES people(id) ON DELETE SET NULL,
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    invitation_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'accepted', 'declined', 'expired')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(artist_profile_id, event_id)
);

-- Create indexes
CREATE INDEX idx_artist_invites_artist ON artist_invites(artist_profile_id);
CREATE INDEX idx_artist_invites_event ON artist_invites(event_id);
CREATE INDEX idx_artist_invites_application ON artist_invites(application_id);
CREATE INDEX idx_artist_invites_admin ON artist_invites(invited_by_admin);
CREATE INDEX idx_artist_invites_status ON artist_invites(status);
CREATE INDEX idx_artist_invites_invited_at ON artist_invites(invited_at);

-- Add RLS policies
ALTER TABLE artist_invites ENABLE ROW LEVEL SECURITY;

-- Policy: Artists can see their own invitations
CREATE POLICY "artists_own_invites" ON artist_invites
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM artist_profiles 
            WHERE artist_profiles.id = artist_invites.artist_profile_id
            AND artist_profiles.person_id = ((auth.jwt() ->> 'user_metadata')::jsonb ->> 'person_id')::uuid
        )
    );

-- Policy: Artists can update their own invitation status
CREATE POLICY "artists_update_invite_status" ON artist_invites
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM artist_profiles 
            WHERE artist_profiles.id = artist_invites.artist_profile_id
            AND artist_profiles.person_id = ((auth.jwt() ->> 'user_metadata')::jsonb ->> 'person_id')::uuid
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM artist_profiles 
            WHERE artist_profiles.id = artist_invites.artist_profile_id
            AND artist_profiles.person_id = ((auth.jwt() ->> 'user_metadata')::jsonb ->> 'person_id')::uuid
        )
    );

-- Policy: Allow public read access to invitations (if needed for admin views)
CREATE POLICY "public_read_invites" ON artist_invites
    FOR SELECT TO anon, authenticated
    USING (status IN ('accepted'));

-- Update trigger
CREATE TRIGGER update_artist_invites_updated_at
    BEFORE UPDATE ON artist_invites
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();