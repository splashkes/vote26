-- Fix RLS policies for artist_sample_works table - correct metadata location
-- Drop existing policies and create simpler ones

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can view artist sample works" ON artist_sample_works;
DROP POLICY IF EXISTS "Artists can manage own sample works" ON artist_sample_works;

-- Anyone can view sample works (public portfolio)
CREATE POLICY "Anyone can view artist sample works" ON artist_sample_works
    FOR SELECT
    USING (true);

-- Simplified policy: Artists can manage works for profiles they own
-- Check if the artist_profile belongs to the authenticated user's person (from user_metadata)
CREATE POLICY "Artists can manage own sample works" ON artist_sample_works
    FOR ALL
    TO authenticated
    USING (
        artist_profile_id IN (
            SELECT id FROM artist_profiles 
            WHERE person_id = (auth.jwt() -> 'user_metadata' ->> 'person_id')::uuid
        )
    )
    WITH CHECK (
        artist_profile_id IN (
            SELECT id FROM artist_profiles 
            WHERE person_id = (auth.jwt() -> 'user_metadata' ->> 'person_id')::uuid
        )
    );