-- Add RLS policy for ABHQ admin users to update artist_profiles
-- This fixes the timeout issue when toggling manual_payment_override

-- Allow ABHQ admin users to update artist_profiles
CREATE POLICY admin_update_artist_profiles
ON artist_profiles
FOR UPDATE
TO authenticated
USING (
  auth.uid() IN (
    SELECT user_id
    FROM abhq_admin_users
    WHERE active = true
  )
);

COMMENT ON POLICY admin_update_artist_profiles ON artist_profiles IS 'Allow active ABHQ admin users to update any artist profile';
