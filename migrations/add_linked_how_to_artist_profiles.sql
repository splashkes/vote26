-- Add linked_how column to artist_profiles to track how person_id was linked
-- Date: 2025-10-16
-- Purpose: Track the method used to link artist_profiles to people records

-- Add the column
ALTER TABLE artist_profiles
ADD COLUMN IF NOT EXISTS linked_how VARCHAR(100);

-- Add index for filtering by link method
CREATE INDEX IF NOT EXISTS idx_artist_profiles_linked_how ON artist_profiles(linked_how);

-- Add comment explaining the column
COMMENT ON COLUMN artist_profiles.linked_how IS 'Tracks how the person_id link was established. Values: artb-admin-event (admin added to event), manual-reconciliation (admin reconcile tool), user-login (user logged in and selected), auto-phone-match (system matched by phone)';
