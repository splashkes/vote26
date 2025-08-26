-- Add RLS policies for confirmation cancellation
-- Date: August 25, 2025

-- Enable RLS on artist_confirmations if not already enabled
ALTER TABLE artist_confirmations ENABLE ROW LEVEL SECURITY;

-- Allow artists to update their own confirmations (for cancellation)
CREATE POLICY IF NOT EXISTS "Artists can update their own confirmations"
ON artist_confirmations
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM artist_profiles 
    WHERE artist_profiles.id = artist_confirmations.artist_profile_id 
    AND artist_profiles.person_id = ((((auth.jwt() ->> 'user_metadata'::text))::jsonb ->> 'person_id'::text))::uuid
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM artist_profiles 
    WHERE artist_profiles.id = artist_confirmations.artist_profile_id 
    AND artist_profiles.person_id = ((((auth.jwt() ->> 'user_metadata'::text))::jsonb ->> 'person_id'::text))::uuid
  )
);

-- Allow artists to read their own confirmations (including withdrawn ones for debugging)
CREATE POLICY IF NOT EXISTS "Artists can read their own confirmations"
ON artist_confirmations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM artist_profiles 
    WHERE artist_profiles.id = artist_confirmations.artist_profile_id 
    AND artist_profiles.person_id = ((((auth.jwt() ->> 'user_metadata'::text))::jsonb ->> 'person_id'::text))::uuid
  )
);