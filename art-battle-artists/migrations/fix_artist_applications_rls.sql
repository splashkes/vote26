-- Drop the incorrect policy
DROP POLICY IF EXISTS "artists_own_applications" ON artist_applications;

-- Create corrected policy
CREATE POLICY "artists_own_applications" ON artist_applications
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM artist_profiles 
            WHERE artist_profiles.id = artist_applications.artist_profile_id
            AND artist_profiles.person_id = ((auth.jwt() ->> 'user_metadata')::jsonb ->> 'person_id')::uuid
        )
    );