-- Create function to generate custom artist IDs based on first name + incrementing number

CREATE OR REPLACE FUNCTION generate_artist_id(first_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    prefix TEXT;
    next_number INTEGER;
    new_id TEXT;
    id_exists BOOLEAN;
BEGIN
    -- Extract first 2 letters from first name, uppercase, default to 'AR' if empty
    prefix := UPPER(SUBSTRING(REGEXP_REPLACE(COALESCE(first_name, ''), '[^A-Za-z]', '', 'g') FROM 1 FOR 2));
    IF LENGTH(prefix) < 2 THEN
        prefix := 'AR'; -- Default prefix
    END IF;
    
    -- Start from 5000 and find next available number
    next_number := 5000;
    
    LOOP
        new_id := prefix || next_number::TEXT;
        
        -- Check if this ID already exists in any ID field
        SELECT EXISTS (
            SELECT 1 FROM artist_profiles 
            WHERE mongo_id = new_id 
               OR entry_id::TEXT = new_id
               OR form_17_entry_id::TEXT = new_id
               OR aliases ? new_id
        ) INTO id_exists;
        
        -- If ID doesn't exist, we can use it
        IF NOT id_exists THEN
            RETURN new_id;
        END IF;
        
        -- Try next number
        next_number := next_number + 1;
        
        -- Safety valve to prevent infinite loop
        IF next_number > 99999 THEN
            RAISE EXCEPTION 'Unable to generate unique artist ID for prefix %', prefix;
        END IF;
    END LOOP;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION generate_artist_id(TEXT) TO authenticated;

-- Add comment
COMMENT ON FUNCTION generate_artist_id(TEXT) IS 'Generates unique artist IDs using first 2 letters of name + incrementing number starting from 5000';