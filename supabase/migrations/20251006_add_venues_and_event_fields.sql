-- Migration: Add venues table, venue logos, and new event fields
-- Date: 2025-10-06

-- Create venues table
CREATE TABLE IF NOT EXISTS public.venues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    address TEXT,
    notes TEXT,
    city_id UUID REFERENCES public.cities(id) ON DELETE SET NULL,
    default_capacity INTEGER DEFAULT 200,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create venue_logos table for multiple logos per venue
CREATE TABLE IF NOT EXISTS public.venue_logos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE,
    logo_url TEXT NOT NULL,
    logo_type TEXT, -- e.g., 'primary', 'dark', 'light', 'alternate'
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add new fields to events table
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS ticket_price_notes TEXT,
ADD COLUMN IF NOT EXISTS meta_ads_budget NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS other_ads_budget NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS event_folder_link TEXT,
ADD COLUMN IF NOT EXISTS event_info_approved_by TEXT,
ADD COLUMN IF NOT EXISTS event_info_approved_at TIMESTAMP WITH TIME ZONE;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_venues_city_id ON public.venues(city_id);
CREATE INDEX IF NOT EXISTS idx_venues_name ON public.venues(name);
CREATE INDEX IF NOT EXISTS idx_venue_logos_venue_id ON public.venue_logos(venue_id);
CREATE INDEX IF NOT EXISTS idx_events_venue_id ON public.events(venue_id);

-- Enable RLS on new tables
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_logos ENABLE ROW LEVEL SECURITY;

-- RLS Policies for venues (ABHQ admins can manage)
CREATE POLICY "ABHQ admins can view all venues"
    ON public.venues FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.abhq_admin
            WHERE abhq_admin.profile_id = auth.uid()
        )
    );

CREATE POLICY "ABHQ admins can insert venues"
    ON public.venues FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.abhq_admin
            WHERE abhq_admin.profile_id = auth.uid()
        )
    );

CREATE POLICY "ABHQ admins can update venues"
    ON public.venues FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.abhq_admin
            WHERE abhq_admin.profile_id = auth.uid()
        )
    );

CREATE POLICY "ABHQ admins can delete venues"
    ON public.venues FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.abhq_admin
            WHERE abhq_admin.profile_id = auth.uid()
        )
    );

-- RLS Policies for venue_logos (ABHQ admins can manage)
CREATE POLICY "ABHQ admins can view all venue logos"
    ON public.venue_logos FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.abhq_admin
            WHERE abhq_admin.profile_id = auth.uid()
        )
    );

CREATE POLICY "ABHQ admins can insert venue logos"
    ON public.venue_logos FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.abhq_admin
            WHERE abhq_admin.profile_id = auth.uid()
        )
    );

CREATE POLICY "ABHQ admins can update venue logos"
    ON public.venue_logos FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.abhq_admin
            WHERE abhq_admin.profile_id = auth.uid()
        )
    );

CREATE POLICY "ABHQ admins can delete venue logos"
    ON public.venue_logos FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.abhq_admin
            WHERE abhq_admin.profile_id = auth.uid()
        )
    );

-- Populate venues from existing events (unique venue + city combinations)
INSERT INTO public.venues (name, city_id, default_capacity, created_at)
SELECT DISTINCT ON (TRIM(venue), city_id)
    TRIM(venue) as name,
    city_id,
    200 as default_capacity,
    MIN(created_at) as created_at
FROM public.events
WHERE venue IS NOT NULL
  AND TRIM(venue) != ''
  AND city_id IS NOT NULL
GROUP BY TRIM(venue), city_id
ORDER BY TRIM(venue), city_id, MIN(created_at);

-- Link events to their venues
UPDATE public.events e
SET venue_id = v.id
FROM public.venues v
WHERE TRIM(e.venue) = v.name
  AND e.city_id = v.city_id
  AND e.venue IS NOT NULL
  AND TRIM(e.venue) != ''
  AND e.city_id IS NOT NULL;

-- Add comment to explain the dual venue system
COMMENT ON COLUMN public.events.venue IS 'Legacy text venue name - kept for backwards compatibility and manual overrides';
COMMENT ON COLUMN public.events.venue_id IS 'Reference to venues table - preferred method for venue management';

-- Add updated_at trigger for venues
CREATE OR REPLACE FUNCTION update_venues_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER venues_updated_at
    BEFORE UPDATE ON public.venues
    FOR EACH ROW
    EXECUTE FUNCTION update_venues_updated_at();

-- Add updated_at trigger for venue_logos
CREATE OR REPLACE FUNCTION update_venue_logos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER venue_logos_updated_at
    BEFORE UPDATE ON public.venue_logos
    FOR EACH ROW
    EXECUTE FUNCTION update_venue_logos_updated_at();
