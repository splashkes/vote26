-- Create artist_applications table
CREATE TABLE IF NOT EXISTS artist_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_profile_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    application_status TEXT DEFAULT 'pending' CHECK (application_status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    notes TEXT,
    UNIQUE(artist_profile_id, event_id)
);

-- Create indexes
CREATE INDEX idx_artist_applications_artist ON artist_applications(artist_profile_id);
CREATE INDEX idx_artist_applications_event ON artist_applications(event_id);
CREATE INDEX idx_artist_applications_status ON artist_applications(application_status);
CREATE INDEX idx_artist_applications_applied_at ON artist_applications(applied_at);

-- Add RLS policies
ALTER TABLE artist_applications ENABLE ROW LEVEL SECURITY;

-- Policy: Artists can only see and manage their own applications
CREATE POLICY "artists_own_applications" ON artist_applications
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM artist_profiles 
            WHERE artist_profiles.id = artist_applications.artist_profile_id
            AND artist_profiles.person_id = (auth.jwt() ->> 'user_metadata')::jsonb ->> 'person_id'
        )
    );

-- Policy: Allow anonymous read access to applications for public viewing (if needed)
CREATE POLICY "public_read_applications" ON artist_applications
    FOR SELECT TO anon, authenticated
    USING (application_status IN ('accepted'));

-- Update trigger
CREATE TRIGGER update_artist_applications_updated_at
    BEFORE UPDATE ON artist_applications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();