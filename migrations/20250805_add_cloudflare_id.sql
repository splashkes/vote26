-- Add cloudflare_id column to media_files table to track Cloudflare Images IDs
ALTER TABLE media_files 
ADD COLUMN IF NOT EXISTS cloudflare_id TEXT;

-- Add an index for quick lookups
CREATE INDEX IF NOT EXISTS idx_media_files_cloudflare_id 
ON media_files(cloudflare_id) 
WHERE cloudflare_id IS NOT NULL;

-- Add metadata column for storing additional info
ALTER TABLE media_files 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';