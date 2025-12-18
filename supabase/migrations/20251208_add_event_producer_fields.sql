-- Migration: Add producer event fields
-- Fields: flyer_details, door_time, paint_time, showtime, event_level

-- Create enum for event level
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_level_type') THEN
        CREATE TYPE event_level_type AS ENUM (
            'REGULAR',
            'CHAMPION_CITY',
            'CHAMPION_NATIONAL',
            'PRIVATE',
            'SPECIAL'
        );
    END IF;
END$$;

-- Add new columns to events table
ALTER TABLE events
ADD COLUMN IF NOT EXISTS flyer_details TEXT,
ADD COLUMN IF NOT EXISTS door_time TIME WITHOUT TIME ZONE,
ADD COLUMN IF NOT EXISTS paint_time TIME WITHOUT TIME ZONE,
ADD COLUMN IF NOT EXISTS showtime TIME WITHOUT TIME ZONE,
ADD COLUMN IF NOT EXISTS event_level event_level_type DEFAULT 'REGULAR';

-- Add comments for documentation
COMMENT ON COLUMN events.flyer_details IS 'Additional details to display on event flyers';
COMMENT ON COLUMN events.door_time IS 'Time when doors open (local time)';
COMMENT ON COLUMN events.paint_time IS 'Time when painting begins (local time)';
COMMENT ON COLUMN events.showtime IS 'Time when the show starts (local time)';
COMMENT ON COLUMN events.event_level IS 'Classification of event type: REGULAR, CHAMPION_CITY, CHAMPION_NATIONAL, PRIVATE, SPECIAL';
