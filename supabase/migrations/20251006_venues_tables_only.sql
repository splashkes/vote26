-- Migration: Create venues and venue_logos tables (without RLS)
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
    logo_type TEXT,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_venues_city_id ON public.venues(city_id);
CREATE INDEX IF NOT EXISTS idx_venues_name ON public.venues(name);
CREATE INDEX IF NOT EXISTS idx_venue_logos_venue_id ON public.venue_logos(venue_id);

-- Add updated_at triggers
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
