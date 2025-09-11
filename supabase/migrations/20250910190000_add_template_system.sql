-- Template system for promo materials generator
-- Migration: 20250910190000_add_template_system

-- Template catalogue
CREATE TABLE IF NOT EXISTS tmpl_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  version int NOT NULL DEFAULT 1,
  kind text CHECK (kind IN ('eventWide','perArtist')) NOT NULL,
  spec jsonb NOT NULL,             -- Template specification JSON
  published boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Binary/static assets referenced by spec (stored in Supabase Storage/CDN)
CREATE TABLE IF NOT EXISTS tmpl_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES tmpl_templates(id) ON DELETE CASCADE,
  role text CHECK (role IN ('frame','logo','mask','bg','font','other')),
  url text NOT NULL,
  meta jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Output tracking (even though MVP renders client-side)
CREATE TABLE IF NOT EXISTS tmpl_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  artist_id uuid,                         -- null for eventWide
  template_id uuid REFERENCES tmpl_templates(id),
  variant text DEFAULT 'square',
  kind text CHECK (kind IN ('png','mp4')) NOT NULL,
  status text CHECK (status IN ('generated','error')) DEFAULT 'generated',
  output_url text,                        -- optional if user downloads locally
  meta jsonb DEFAULT '{}',                -- fps, duration, pixelRatio, etc.
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tmpl_templates_published ON tmpl_templates(published);
CREATE INDEX IF NOT EXISTS idx_tmpl_templates_kind ON tmpl_templates(kind);
CREATE INDEX IF NOT EXISTS idx_tmpl_assets_template_id ON tmpl_assets(template_id);
CREATE INDEX IF NOT EXISTS idx_tmpl_outputs_event_id ON tmpl_outputs(event_id);
CREATE INDEX IF NOT EXISTS idx_tmpl_outputs_artist_id ON tmpl_outputs(artist_id);
CREATE INDEX IF NOT EXISTS idx_tmpl_outputs_template_id ON tmpl_outputs(template_id);

-- Add RLS policies
ALTER TABLE tmpl_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE tmpl_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tmpl_outputs ENABLE ROW LEVEL SECURITY;

-- Templates: Public can read published templates, authenticated can manage all
CREATE POLICY "Public can view published templates" ON tmpl_templates
    FOR SELECT USING (published = true);

CREATE POLICY "Authenticated users can manage templates" ON tmpl_templates
    FOR ALL USING (auth.role() = 'authenticated');

-- Assets: Public can read, authenticated can manage
CREATE POLICY "Public can view template assets" ON tmpl_assets
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage assets" ON tmpl_assets
    FOR ALL USING (auth.role() = 'authenticated');

-- Outputs: Public can read, authenticated can manage
CREATE POLICY "Public can view outputs" ON tmpl_outputs
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage outputs" ON tmpl_outputs
    FOR ALL USING (auth.role() = 'authenticated');

-- Add updated_at trigger for templates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tmpl_templates_updated_at 
    BEFORE UPDATE ON tmpl_templates 
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();