-- Create artist_sample_works table to track artist portfolio images
-- Links artist profiles to media files for their sample work showcase

CREATE TABLE IF NOT EXISTS artist_sample_works (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_profile_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
    media_file_id UUID NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
    title VARCHAR(255),
    description TEXT,
    year_created INTEGER,
    medium VARCHAR(100), -- e.g., "Acrylic on Canvas", "Digital Art", etc.
    dimensions VARCHAR(100), -- e.g., "24x36 inches", "1920x1080 pixels"
    display_order INTEGER DEFAULT 0,
    is_featured BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(artist_profile_id, media_file_id)
);

-- Create indexes
CREATE INDEX idx_artist_sample_works_profile_id ON artist_sample_works(artist_profile_id);
CREATE INDEX idx_artist_sample_works_media_id ON artist_sample_works(media_file_id);
CREATE INDEX idx_artist_sample_works_display_order ON artist_sample_works(artist_profile_id, display_order);
CREATE INDEX idx_artist_sample_works_featured ON artist_sample_works(artist_profile_id, is_featured) WHERE is_featured = true;

-- Enable RLS
ALTER TABLE artist_sample_works ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Anyone can view sample works (public portfolio)
CREATE POLICY "Anyone can view artist sample works" ON artist_sample_works
    FOR SELECT
    USING (true);

-- Artists can manage their own sample works
CREATE POLICY "Artists can manage own sample works" ON artist_sample_works
    FOR ALL
    TO authenticated
    USING (
        artist_profile_id IN (
            SELECT id FROM artist_profiles WHERE person_id = (
                SELECT person_id FROM people WHERE id = (
                    SELECT (auth.jwt() -> 'app_metadata' ->> 'person_id')::uuid
                )
            )
        )
    )
    WITH CHECK (
        artist_profile_id IN (
            SELECT id FROM artist_profiles WHERE person_id = (
                SELECT person_id FROM people WHERE id = (
                    SELECT (auth.jwt() -> 'app_metadata' ->> 'person_id')::uuid
                )
            )
        )
    );

-- Function to ensure only 10 sample works per artist
CREATE OR REPLACE FUNCTION enforce_sample_works_limit()
RETURNS TRIGGER AS $$
BEGIN
    IF (
        SELECT COUNT(*) 
        FROM artist_sample_works 
        WHERE artist_profile_id = NEW.artist_profile_id
    ) >= 10 THEN
        RAISE EXCEPTION 'Artist can have at most 10 sample works';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for sample works limit
CREATE TRIGGER enforce_sample_works_limit_trigger
    BEFORE INSERT ON artist_sample_works
    FOR EACH ROW
    EXECUTE FUNCTION enforce_sample_works_limit();

-- Function to ensure only one featured work per artist
CREATE OR REPLACE FUNCTION ensure_single_featured_work()
RETURNS TRIGGER AS $$
BEGIN
    -- If this work is being set as featured, unfeatured all others for this artist
    IF NEW.is_featured = true THEN
        UPDATE artist_sample_works 
        SET is_featured = false 
        WHERE artist_profile_id = NEW.artist_profile_id 
        AND id != COALESCE(NEW.id, gen_random_uuid());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for single featured work
CREATE TRIGGER ensure_single_featured_work_trigger
    BEFORE INSERT OR UPDATE ON artist_sample_works
    FOR EACH ROW
    EXECUTE FUNCTION ensure_single_featured_work();

-- Update updated_at timestamp
CREATE TRIGGER update_artist_sample_works_updated_at
    BEFORE UPDATE ON artist_sample_works
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comment
COMMENT ON TABLE artist_sample_works IS 'Portfolio showcase images for artist profiles, limited to 10 per artist';