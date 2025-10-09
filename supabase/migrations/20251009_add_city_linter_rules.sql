-- Add city-based linter rules to existing event_linter_rules table
-- Date: 2025-10-09
-- Purpose: Track city-level findings (e.g., good past performance but no future bookings)

-- Insert city-based rules into existing event_linter_rules table
INSERT INTO event_linter_rules (rule_id, name, description, severity, category, context, conditions, message, status) VALUES
  (
    'city_good_event_no_booking',
    'Good Past Performance, No Future Event',
    'City had at least one good event (200+ votes) in last 2 events but has no upcoming events booked',
    'warning',
    'booking_opportunity',
    'always',
    '[]'::jsonb,
    'City has had good events (200+ votes) recently but no future events scheduled',
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
-- SELECT rule_id, name, category, severity FROM event_linter_rules WHERE category = 'booking_opportunity';
