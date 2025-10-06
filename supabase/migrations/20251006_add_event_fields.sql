-- Migration: Add new fields to events table
-- Date: 2025-10-06

-- Add new columns to events table
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS ticket_price_notes TEXT,
ADD COLUMN IF NOT EXISTS meta_ads_budget NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS other_ads_budget NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS event_folder_link TEXT,
ADD COLUMN IF NOT EXISTS event_info_approved_by TEXT,
ADD COLUMN IF NOT EXISTS event_info_approved_at TIMESTAMP WITH TIME ZONE;

-- Create index for venue_id
CREATE INDEX IF NOT EXISTS idx_events_venue_id ON public.events(venue_id);

-- Add helpful comments
COMMENT ON COLUMN public.events.venue IS 'Legacy text venue name - kept for backwards compatibility and manual overrides';
COMMENT ON COLUMN public.events.venue_id IS 'Reference to venues table - preferred method for venue management';
COMMENT ON COLUMN public.events.ticket_price_notes IS 'Long text notes about ticket pricing';
COMMENT ON COLUMN public.events.meta_ads_budget IS 'Budget allocated for Meta (Facebook/Instagram) advertising';
COMMENT ON COLUMN public.events.other_ads_budget IS 'Budget allocated for other advertising channels';
COMMENT ON COLUMN public.events.event_folder_link IS 'Google Drive folder link for event materials';
COMMENT ON COLUMN public.events.event_info_approved_by IS 'Email of admin who approved event information';
COMMENT ON COLUMN public.events.event_info_approved_at IS 'Timestamp when event information was approved';
