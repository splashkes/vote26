-- Add multi-image support columns to app_curated_content table
ALTER TABLE app_curated_content 
ADD COLUMN image_urls text[], 
ADD COLUMN thumbnail_urls text[];

-- Add comments to document the new columns
COMMENT ON COLUMN app_curated_content.image_urls IS 'Array of image URLs for multi-image content support';
COMMENT ON COLUMN app_curated_content.thumbnail_urls IS 'Array of thumbnail URLs corresponding to image_urls';

-- Create indexes for better query performance on the new array columns
CREATE INDEX IF NOT EXISTS idx_app_curated_content_image_urls ON app_curated_content USING GIN(image_urls);
CREATE INDEX IF NOT EXISTS idx_app_curated_content_thumbnail_urls ON app_curated_content USING GIN(thumbnail_urls);