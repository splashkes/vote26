-- Fix eventbrite_not_linked rule to check for ANY ticket link, not just Eventbrite
-- This rule should only fire when BOTH ticket_link AND eventbrite_id are empty
-- Keep the same rule_id to preserve hit_count and any future suppressions

UPDATE event_linter_rules
SET
  name = 'No Ticket Link',
  conditions = '[
    {"field": "event_start_datetime", "value": 14, "operator": "upcoming_days"},
    {"field": "ticket_link", "operator": "is_empty"},
    {"field": "eventbrite_id", "operator": "is_empty"}
  ]'::jsonb,
  message = 'Event in {{days_until}} days but no ticket link configured (Eventbrite or custom link)',
  description = 'Event is within 14 days but has neither a ticket_link nor an eventbrite_id set. At least one ticket sales method should be configured.'
WHERE rule_id = 'eventbrite_not_linked';
