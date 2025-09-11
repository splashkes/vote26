-- Create promo_materials table to track generated promotional content
CREATE TABLE IF NOT EXISTS promo_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Event and artist relationship
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    artist_id UUID REFERENCES artist_profiles(id) ON DELETE CASCADE,
    
    -- Template information
    template_id UUID NOT NULL,
    template_name TEXT NOT NULL,
    template_kind TEXT NOT NULL CHECK (template_kind IN ('eventWide', 'perArtist')),
    variant TEXT NOT NULL, -- e.g., 'square', 'story', 'portrait'
    
    -- Generation status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'ready', 'failed')),
    
    -- Cloudflare Images integration
    cf_image_id TEXT, -- Cloudflare Images ID
    png_url TEXT, -- Full-size PNG URL from CF
    webm_url TEXT, -- Full-size WebM URL from CF
    thumbnail_url TEXT, -- Thumbnail URL from CF (for previews)
    
    -- File metadata
    width INTEGER,
    height INTEGER,
    file_size_png INTEGER, -- bytes
    file_size_webm INTEGER, -- bytes
    
    -- Generation metadata
    generation_metadata JSONB DEFAULT '{}',
    error_message TEXT,
    generated_at TIMESTAMP WITH TIME ZONE,
    
    -- Standard fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique combinations
    UNIQUE(event_id, artist_id, template_id, variant)
);

-- Indexes for efficient lookups
CREATE INDEX idx_promo_materials_event_id ON promo_materials(event_id);
CREATE INDEX idx_promo_materials_artist_id ON promo_materials(artist_id);
CREATE INDEX idx_promo_materials_template_id ON promo_materials(template_id);
CREATE INDEX idx_promo_materials_status ON promo_materials(status);
CREATE INDEX idx_promo_materials_template_kind ON promo_materials(template_kind);
CREATE INDEX idx_promo_materials_cf_image_id ON promo_materials(cf_image_id) WHERE cf_image_id IS NOT NULL;

-- Unique index for event-wide templates (artist_id is NULL)
CREATE UNIQUE INDEX idx_promo_materials_event_wide_unique 
ON promo_materials(event_id, template_id, variant) 
WHERE artist_id IS NULL;

-- Update trigger
CREATE OR REPLACE FUNCTION update_promo_materials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_promo_materials_updated_at
    BEFORE UPDATE ON promo_materials
    FOR EACH ROW
    EXECUTE FUNCTION update_promo_materials_updated_at();

-- RLS Policies
ALTER TABLE promo_materials ENABLE ROW LEVEL SECURITY;

-- Allow public read access to ready materials
CREATE POLICY "Public can read ready promo materials" ON promo_materials
    FOR SELECT
    USING (status = 'ready');

-- Allow authenticated users to create/update materials
CREATE POLICY "Authenticated users can manage promo materials" ON promo_materials
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Allow service role full access
CREATE POLICY "Service role full access to promo materials" ON promo_materials
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Comments for documentation
COMMENT ON TABLE promo_materials IS 'Tracks generated promotional materials with Cloudflare Images integration';
COMMENT ON COLUMN promo_materials.template_kind IS 'eventWide templates apply to entire event, perArtist templates are artist-specific';
COMMENT ON COLUMN promo_materials.cf_image_id IS 'Cloudflare Images ID for accessing different variants/sizes';
COMMENT ON COLUMN promo_materials.generation_metadata IS 'Additional metadata about generation process (browser, IP, etc.)';