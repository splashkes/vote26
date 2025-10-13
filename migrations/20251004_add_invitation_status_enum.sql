-- Add invitation status enum type
-- This migration creates a proper enum type for invitation statuses and migrates existing data

-- Create the enum type
CREATE TYPE invitation_status AS ENUM (
  'pending',      -- Invitation sent, not yet responded to
  'accepted',     -- Artist accepted the invitation (confirmation created)
  'declined',     -- Artist explicitly declined the invitation
  'withdrawn',    -- Producer/admin withdrew the invitation
  'expired'       -- Event applications closed before artist responded
);

-- Add a new column with the enum type
ALTER TABLE artist_invitations
ADD COLUMN status_enum invitation_status;

-- Migrate existing data: all 'pending' text values to 'pending' enum
-- If accepted_at is set, mark as 'accepted'
UPDATE artist_invitations
SET status_enum = CASE
  WHEN accepted_at IS NOT NULL THEN 'accepted'::invitation_status
  ELSE 'pending'::invitation_status
END;

-- Make the new column NOT NULL now that all rows have values
ALTER TABLE artist_invitations
ALTER COLUMN status_enum SET NOT NULL;

-- Rename columns: keep the old status as status_old for safety, use status_enum as status
ALTER TABLE artist_invitations
RENAME COLUMN status TO status_old;

ALTER TABLE artist_invitations
RENAME COLUMN status_enum TO status;

-- Add index for faster status queries
CREATE INDEX idx_artist_invitations_status ON artist_invitations(status);

-- Add comment explaining the enum values
COMMENT ON COLUMN artist_invitations.status IS 'Invitation status: pending (not responded), accepted (confirmation created), declined (artist declined), withdrawn (producer withdrew), expired (applications closed)';

-- Note: The old status_old column can be dropped in a future migration after verifying the migration worked correctly
