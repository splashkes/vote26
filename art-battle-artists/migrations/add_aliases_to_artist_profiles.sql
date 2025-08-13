-- Add aliases array to artist_profiles table for tracking all past Form 17 IDs and other identifiers

-- Add aliases column as JSONB array to store all past identifiers
ALTER TABLE artist_profiles 
ADD COLUMN aliases JSONB DEFAULT '[]'::jsonb;

-- Add index for fast alias lookups using GIN index on JSONB
CREATE INDEX idx_artist_profiles_aliases ON artist_profiles USING GIN (aliases);

-- Add comment
COMMENT ON COLUMN artist_profiles.aliases IS 'Array of all past identifiers (Form 17 IDs, etc.) for this artist profile';