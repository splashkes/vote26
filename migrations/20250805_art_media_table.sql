-- Create art_media table for storing artwork photos and media
CREATE TABLE IF NOT EXISTS art_media (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    art_id UUID NOT NULL REFERENCES art(id) ON DELETE CASCADE,
    media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
    media_files JSONB NOT NULL DEFAULT '{}',
    -- media_files structure:
    -- {
    --   "original_url": "https://...",
    --   "compressed_url": "https://...",
    --   "thumbnail_url": "https://...",
    --   "cloudflare_id": "...",
    --   "width": 1920,
    --   "height": 1080,
    --   "size_bytes": 123456
    -- }
    display_order INT DEFAULT 0,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    metadata JSONB DEFAULT '{}'
);

-- Create indexes
CREATE INDEX idx_art_media_art_id ON art_media(art_id);
CREATE INDEX idx_art_media_display_order ON art_media(art_id, display_order);
CREATE INDEX idx_art_media_is_primary ON art_media(art_id, is_primary) WHERE is_primary = true;

-- Enable RLS
ALTER TABLE art_media ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Anyone can view art media
CREATE POLICY "Art media is viewable by everyone" ON art_media
    FOR SELECT USING (true);

-- Only authenticated users can insert (will be further restricted by app logic)
CREATE POLICY "Authenticated users can insert art media" ON art_media
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);

-- Only the creator or admin can update/delete
CREATE POLICY "Users can update their own art media" ON art_media
    FOR UPDATE TO authenticated
    USING (created_by = auth.uid());

CREATE POLICY "Users can delete their own art media" ON art_media
    FOR DELETE TO authenticated
    USING (created_by = auth.uid());

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

-- Create trigger for primary image enforcement
CREATE TRIGGER enforce_single_primary_image
    BEFORE INSERT OR UPDATE ON art_media
    FOR EACH ROW
    EXECUTE FUNCTION ensure_single_primary_image();

-- Add updated_at trigger
CREATE TRIGGER update_art_media_updated_at
    BEFORE UPDATE ON art_media
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT ALL ON art_media TO authenticated;
GRANT SELECT ON art_media TO anon;