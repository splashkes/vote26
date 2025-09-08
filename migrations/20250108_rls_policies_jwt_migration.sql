-- RLS Policies Migration from user_metadata to JWT claims
-- Date: 2025-01-08
-- Purpose: Update all RLS policies to use JWT claims instead of deprecated user_metadata

-- Update artist_sample_works RLS policy
DROP POLICY IF EXISTS "Artists can manage own sample works" ON artist_sample_works;
CREATE POLICY "Artists can manage own sample works v2" ON artist_sample_works
FOR ALL 
TO authenticated 
USING (
    artist_profile_id IN (
        SELECT artist_profiles.id
        FROM artist_profiles
        WHERE artist_profiles.person_id = (auth.jwt() ->> 'person_id')::uuid
    )
);

-- Update artist_applications RLS policy
DROP POLICY IF EXISTS "artists_own_applications" ON artist_applications;
CREATE POLICY "artists_own_applications_v2" ON artist_applications
FOR ALL 
TO authenticated 
USING (
    EXISTS (
        SELECT 1
        FROM artist_profiles
        WHERE artist_profiles.id = artist_applications.artist_profile_id 
          AND artist_profiles.person_id = (auth.jwt() ->> 'person_id')::uuid
    )
);

-- Update artist_confirmations RLS policy  
DROP POLICY IF EXISTS "Artists can read their own confirmations" ON artist_confirmations;
CREATE POLICY "Artists can read their own confirmations v2" ON artist_confirmations
FOR SELECT 
TO authenticated 
USING (
    EXISTS (
        SELECT 1
        FROM artist_profiles ap
        WHERE ap.id = artist_confirmations.artist_profile_id 
          AND ap.person_id = (auth.jwt() ->> 'person_id')::uuid
    )
);

-- Update artist_invitations RLS policy
DROP POLICY IF EXISTS "artists_own_invites" ON artist_invitations;
CREATE POLICY "artists_own_invites_v2" ON artist_invitations
FOR ALL 
TO authenticated 
USING (
    EXISTS (
        SELECT 1
        FROM artist_profiles ap
        WHERE ap.id = artist_invitations.artist_profile_id 
          AND ap.person_id = (auth.jwt() ->> 'person_id')::uuid
    )
);

-- Update artist_invites RLS policies (both of them)
DROP POLICY IF EXISTS "artists_own_invites" ON artist_invites;
DROP POLICY IF EXISTS "artists_update_invite_status" ON artist_invites;

CREATE POLICY "artists_own_invites_v2" ON artist_invites
FOR SELECT 
TO authenticated 
USING (
    EXISTS (
        SELECT 1
        FROM artist_profiles
        WHERE artist_profiles.id = artist_invites.artist_profile_id 
          AND artist_profiles.person_id = (auth.jwt() ->> 'person_id')::uuid
    )
);

CREATE POLICY "artists_update_invite_status_v2" ON artist_invites
FOR UPDATE 
TO authenticated 
USING (
    EXISTS (
        SELECT 1
        FROM artist_profiles
        WHERE artist_profiles.id = artist_invites.artist_profile_id 
          AND artist_profiles.person_id = (auth.jwt() ->> 'person_id')::uuid
    )
);

-- Update payment_processing RLS policy
DROP POLICY IF EXISTS "Users can view own payments" ON payment_processing;
CREATE POLICY "Users can view own payments v2" ON payment_processing
FOR SELECT 
TO authenticated 
USING (
    person_id = (auth.jwt() ->> 'person_id')::uuid
);