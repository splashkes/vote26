-- Drop the inefficient duplicate RLS policy
DROP POLICY IF EXISTS "authenticated_insert_votes" ON votes;

-- Create an index on people table for phone lookups if not exists
CREATE INDEX IF NOT EXISTS idx_people_phone ON people(phone);
CREATE INDEX IF NOT EXISTS idx_people_phone_number ON people(phone_number);

-- Add index for the person_id lookup pattern used in RLS
CREATE INDEX IF NOT EXISTS idx_people_phone_combined ON people(phone, phone_number, id);

-- Ensure the auth.jwt() function result is cached per transaction
-- This is a Supabase optimization that should already be in place but worth verifying