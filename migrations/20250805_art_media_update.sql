-- Add missing columns to art_media table
ALTER TABLE art_media 
ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;

-- Create missing indexes
CREATE INDEX IF NOT EXISTS idx_art_media_display_order ON art_media(art_id, display_order);
CREATE INDEX IF NOT EXISTS idx_art_media_is_primary ON art_media(art_id, is_primary) WHERE is_primary = true;

-- Create missing RLS policies
CREATE POLICY IF NOT EXISTS "Users can update their own art media" ON art_media
    FOR UPDATE TO authenticated
    USING (created_by = auth.uid() OR created_by IS NULL);

CREATE POLICY IF NOT EXISTS "Users can delete their own art media" ON art_media
    FOR DELETE TO authenticated
    USING (created_by = auth.uid() OR created_by IS NULL);

-- Function to ensure only one primary image per artwork
CREATE OR REPLACE FUNCTION ensure_single_primary_image()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_primary = true THEN
        -- Set all other images for this artwork to non-primary
        UPDATE art_media
        SET is_primary = false
        WHERE art_id = NEW.art_id
          AND id != NEW.id
          AND is_primary = true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for primary image enforcement if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'enforce_single_primary_image'
    ) THEN
        CREATE TRIGGER enforce_single_primary_image
            BEFORE INSERT OR UPDATE ON art_media
            FOR EACH ROW
            EXECUTE FUNCTION ensure_single_primary_image();
    END IF;
END;
$$;