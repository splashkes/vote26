-- Create entry_id sequence starting at 310000, skipping existing numbers
-- Run with: PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -f migrations/create_entry_id_sequence_310000.sql

-- Create a function to get the next available entry_id starting from 310000
CREATE OR REPLACE FUNCTION get_next_entry_id()
RETURNS INTEGER AS $$
DECLARE
    next_id INTEGER := 310000;
BEGIN
    -- Loop until we find an available entry_id
    WHILE EXISTS (SELECT 1 FROM artist_profiles WHERE entry_id = next_id) LOOP
        next_id := next_id + 1;
    END LOOP;
    
    RETURN next_id;
END;
$$ LANGUAGE plpgsql;

-- First, assign entry_ids to any profiles that don't have them
DO $$
DECLARE
    profile_record RECORD;
    new_entry_id INTEGER;
BEGIN
    -- Assign entry_ids to profiles that don't have them
    FOR profile_record IN 
        SELECT id, name FROM artist_profiles WHERE entry_id IS NULL ORDER BY created_at
    LOOP
        new_entry_id := get_next_entry_id();
        UPDATE artist_profiles 
        SET entry_id = new_entry_id 
        WHERE id = profile_record.id;
        
        RAISE NOTICE 'Assigned entry_id % to profile: %', new_entry_id, profile_record.name;
    END LOOP;
END $$;

-- Set default value for entry_id to use our function
ALTER TABLE artist_profiles 
ALTER COLUMN entry_id SET DEFAULT get_next_entry_id();

-- Make entry_id NOT NULL
ALTER TABLE artist_profiles 
ALTER COLUMN entry_id SET NOT NULL;

-- Verify the changes
SELECT 
    'entry_id is now mandatory with auto-generation starting at 310000' AS status,
    COUNT(*) as total_profiles,
    COUNT(entry_id) as profiles_with_entry_id,
    MIN(entry_id) as min_entry_id,
    MAX(entry_id) as max_entry_id
FROM artist_profiles;