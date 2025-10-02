-- Add Eventbrite event verification fields
-- Created: 2025-10-02
-- Purpose: Store Eventbrite event name and date to verify correct event linkage

ALTER TABLE eventbrite_api_cache
  ADD COLUMN IF NOT EXISTS eventbrite_event_name TEXT,
  ADD COLUMN IF NOT EXISTS eventbrite_start_date TIMESTAMP;

COMMENT ON COLUMN eventbrite_api_cache.eventbrite_event_name IS
  'Event name from Eventbrite API - use to verify correct event is linked';

COMMENT ON COLUMN eventbrite_api_cache.eventbrite_start_date IS
  'Event start date from Eventbrite API - use to verify correct event is linked';
