-- Update city very strong performance threshold from 600 to 400 votes
-- Date: 2025-10-09
-- Purpose: Lower threshold to catch more high-performing cities without future bookings

UPDATE event_linter_rules
SET
  description = 'City had at least one very strong event (400+ votes) in history but has no upcoming events booked',
  message = 'City has had very strong events (400+ votes) historically but no future events scheduled',
  updated_at = now()
WHERE rule_id = 'city_very_strong_event_no_booking';

-- Verify
-- SELECT rule_id, name, description, message FROM event_linter_rules WHERE rule_id = 'city_very_strong_event_no_booking';
