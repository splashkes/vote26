-- Add city very strong performance rule
-- Date: 2025-10-09
-- Purpose: Identify cities with exceptional historical performance (600+ votes) but no future bookings

INSERT INTO event_linter_rules (rule_id, name, description, severity, category, context, conditions, message, status) VALUES
  (
    'city_very_strong_event_no_booking',
    'Very Strong Historical Performance, No Future Event',
    'City had at least one very strong event (600+ votes) in history but has no upcoming events booked',
    'warning',
    'booking_opportunity',
    'always',
    '[]'::jsonb,
    'City has had very strong events (600+ votes) historically but no future events scheduled',
    'active'
  )
ON CONFLICT (rule_id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  severity = EXCLUDED.severity,
  category = EXCLUDED.category,
  message = EXCLUDED.message,
  updated_at = now();

-- Verify
-- SELECT rule_id, name, category, severity FROM event_linter_rules WHERE category = 'booking_opportunity' ORDER BY rule_id;
