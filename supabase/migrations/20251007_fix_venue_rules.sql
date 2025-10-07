-- Fix venue rules to use new venue_id instead of old venue text field

-- Update no_venue_configured to check venue_id and limit to upcoming events
-- Change from "always" to only check events within 30 days (covered by venue_not_set_warning)
-- Actually, let's just disable this rule since venue_not_set_warning covers it better
UPDATE event_linter_rules
SET
  status = 'inactive',
  description = 'DEPRECATED: Replaced by venue_not_set_warning which checks venue_id for upcoming events'
WHERE rule_id = 'no_venue_configured';

-- Update event_tomorrow_no_venue to check venue_id instead of venue text
UPDATE event_linter_rules
SET
  conditions = '[
    {"field": "event_start_datetime", "value": 24, "operator": "upcoming_hours"},
    {"field": "venue_id", "operator": "is_null"}
  ]'::jsonb
WHERE rule_id = 'event_tomorrow_no_venue';
