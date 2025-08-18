-- Create storage bucket for art images
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES (
  'art-images',
  'art-images',
  true,  -- Public bucket so images can be viewed by everyone
  false, -- Disable AVIF auto-detection for now
  52428800, -- 50MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;

-- Set up RLS policies for the bucket
-- Anyone can view images
CREATE POLICY "Public Access" ON storage.objects
  FOR SELECT 
  USING (bucket_id = 'art-images');

-- Only authenticated users can upload (we'll check admin status in the app)
CREATE POLICY "Authenticated users can upload images" ON storage.objects
  FOR INSERT 
  WITH CHECK (
    bucket_id = 'art-images' 
    AND auth.role() = 'authenticated'
  );

-- Only the uploader can update their own images
CREATE POLICY "Users can update own images" ON storage.objects
  FOR UPDATE 
  USING (
    bucket_id = 'art-images' 
    AND auth.uid() = owner
  );

-- Only the uploader can delete their own images
CREATE POLICY "Users can delete own images" ON storage.objects
  FOR DELETE 
  USING (
    bucket_id = 'art-images' 
    AND auth.uid() = owner
  );