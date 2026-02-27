-- Backfill artist_profile_id for recent invitations (last 7 days)
-- Date: 2025-11-16
-- Issue: Many invitations were created without artist_profile_id, preventing email delivery

-- Update invitations that have NULL artist_profile_id but have artist_number
-- Match on entry_id (which is the artist_number)
-- ONLY update invitations created in the last 7 days
UPDATE artist_invitations ai
SET artist_profile_id = ap.id,
    updated_at = NOW()
FROM artist_profiles ap
WHERE ai.artist_profile_id IS NULL
  AND ai.artist_number IS NOT NULL
  AND ap.entry_id::text = ai.artist_number
  AND ai.created_at >= NOW() - INTERVAL '7 days';

-- Report results
DO $$
DECLARE
    updated_count INTEGER;
    remaining_null INTEGER;
BEGIN
    -- Get count of what was updated
    GET DIAGNOSTICS updated_count = ROW_COUNT;

    -- Check how many NULL remain in last 7 days
    SELECT COUNT(*) INTO remaining_null
    FROM artist_invitations
    WHERE artist_profile_id IS NULL
      AND artist_number IS NOT NULL
      AND created_at >= NOW() - INTERVAL '7 days';

    RAISE NOTICE 'Backfill complete (last 7 days): % invitations updated', updated_count;
    RAISE NOTICE 'Remaining NULL artist_profile_id in last 7 days (no matching profile): %', remaining_null;
END $$;
