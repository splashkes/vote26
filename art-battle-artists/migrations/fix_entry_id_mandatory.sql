-- Make entry_id mandatory and auto-generate for new profiles
-- Run with: PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -f migrations/fix_entry_id_mandatory.sql

-- First, assign entry_ids to any profiles that don't have them
DO $$
DECLARE
    max_entry_id INTEGER;
    profile_record RECORD;
    new_entry_id INTEGER;
BEGIN
    -- Get the current maximum entry_id
    SELECT COALESCE(MAX(entry_id), 100000) INTO max_entry_id FROM artist_profiles WHERE entry_id IS NOT NULL;
    
    -- Assign entry_ids to profiles that don't have them
    FOR profile_record IN 
        SELECT id FROM artist_profiles WHERE entry_id IS NULL
    LOOP
        max_entry_id := max_entry_id + 1;
        UPDATE artist_profiles 
        SET entry_id = max_entry_id 
        WHERE id = profile_record.id;
        
        RAISE NOTICE 'Assigned entry_id % to profile %', max_entry_id, profile_record.id;
    END LOOP;
END $$;

-- Create a sequence for auto-generating entry_ids
CREATE SEQUENCE IF NOT EXISTS artist_entry_id_seq 
START WITH (SELECT COALESCE(MAX(entry_id), 100000) + 1 FROM artist_profiles);

-- Set default value for entry_id to use the sequence
ALTER TABLE artist_profiles 
ALTER COLUMN entry_id SET DEFAULT nextval('artist_entry_id_seq');

-- Make entry_id NOT NULL
ALTER TABLE artist_profiles 
ALTER COLUMN entry_id SET NOT NULL;

-- Verify the changes
SELECT 'entry_id is now mandatory and auto-generated' AS status;