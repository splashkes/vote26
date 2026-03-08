-- Fix RLS policies on bids table for JWT authentication system
-- Remove old metadata-based policies and add new auth_user_id based policy

-- Drop old policies that use metadata
DROP POLICY IF EXISTS "Authenticated users can insert bids with their person_id" ON bids;
DROP POLICY IF EXISTS "authenticated_insert_bids" ON bids;

-- Create new JWT-compatible policy for inserting bids
CREATE POLICY "jwt_insert_bids" ON bids
FOR INSERT 
TO authenticated
WITH CHECK (
  person_id IN (
    SELECT id 
    FROM people 
    WHERE auth_user_id = auth.uid()
  )
);

-- Verify the policy was created
SELECT policyname, cmd, permissive, roles 
FROM pg_policies 
WHERE tablename = 'bids' AND cmd = 'INSERT';