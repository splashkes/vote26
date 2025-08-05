-- Drop existing policies if they exist and recreate
DO $$
BEGIN
    -- Drop existing update policy if exists
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'art_media' 
        AND policyname = 'Users can update their own art media'
    ) THEN
        DROP POLICY "Users can update their own art media" ON art_media;
    END IF;
    
    -- Drop existing delete policy if exists
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'art_media' 
        AND policyname = 'Users can delete their own art media'
    ) THEN
        DROP POLICY "Users can delete their own art media" ON art_media;
    END IF;
END;
$$;

-- Create policies
CREATE POLICY "Users can update their own art media" ON art_media
    FOR UPDATE TO authenticated
    USING (created_by = auth.uid() OR created_by IS NULL);

CREATE POLICY "Users can delete their own art media" ON art_media
    FOR DELETE TO authenticated
    USING (created_by = auth.uid() OR created_by IS NULL);