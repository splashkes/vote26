-- Add sponsorship package template images table
-- Date: 2025-10-10
-- Purpose: Store visual samples for sponsorship packages

CREATE TABLE IF NOT EXISTS sponsorship_package_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_template_id UUID REFERENCES sponsorship_package_templates(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  cloudflare_id VARCHAR(255),
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX idx_sponsorship_package_images_template ON sponsorship_package_images(package_template_id);
CREATE INDEX idx_sponsorship_package_images_order ON sponsorship_package_images(package_template_id, display_order);

-- Add RLS policies
ALTER TABLE sponsorship_package_images ENABLE ROW LEVEL SECURITY;

-- Admin users can do everything
CREATE POLICY "Admin users can manage package images"
ON sponsorship_package_images
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM abhq_admin_users
    WHERE email = (current_setting('request.jwt.claims', true)::json->>'email')
    AND active = true
  )
);

-- Public read access for published packages
CREATE POLICY "Public can view package images"
ON sponsorship_package_images
FOR SELECT
TO public
USING (true);

COMMENT ON TABLE sponsorship_package_images IS 'Visual sample images for sponsorship package templates';
