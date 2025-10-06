-- Migration: Add event planning fields
-- Date: 2025-10-06

-- Add event planning fields to events table
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS target_artists_booked INTEGER,
ADD COLUMN IF NOT EXISTS wildcard_expected BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS expected_number_of_rounds INTEGER;

-- Add helpful comments
COMMENT ON COLUMN public.events.target_artists_booked IS 'Target number of artists to book for this event';
COMMENT ON COLUMN public.events.wildcard_expected IS 'Whether a wildcard round is expected for this event';
COMMENT ON COLUMN public.events.expected_number_of_rounds IS 'Expected number of rounds for this event';
