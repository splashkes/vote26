-- Allow NULL easel_number for staging artists in events
ALTER TABLE round_contestants 
ALTER COLUMN easel_number DROP NOT NULL;

-- Drop the unique constraint that includes easel_number
ALTER TABLE round_contestants 
DROP CONSTRAINT IF EXISTS round_contestants_round_id_easel_number_key;

-- Create a new unique constraint that only applies when easel_number is NOT NULL
CREATE UNIQUE INDEX round_contestants_round_id_easel_number_key 
ON round_contestants (round_id, easel_number) 
WHERE easel_number IS NOT NULL;

-- Add a comment to explain the pattern
COMMENT ON COLUMN round_contestants.easel_number IS 
'Easel number for the artist in this round. NULL indicates artist is added to event but not yet assigned to an easel.';