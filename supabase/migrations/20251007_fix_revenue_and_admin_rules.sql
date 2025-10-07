-- Fix Event Linter Rules: Revenue Recording and Event Admins
-- Date: 2025-10-07
-- Issue: Rules incorrectly triggering for events with zero revenue or past events

-- Fix revenue recording rules to check updated_at instead of value
-- Problem: Rules were checking if value <= 0, but 0.00 is a valid recorded value
-- Solution: Check if updated_at IS NULL to see if revenue hasn't been recorded yet

UPDATE event_linter_rules
SET conditions = '[{"field": "event_end_datetime", "value": "3_days_ago", "operator": "before"}, {"field": "food_beverage_updated_at", "value": null, "operator": "eq"}]',
    updated_at = now()
WHERE rule_id = 'no_fb_revenue_recorded';

UPDATE event_linter_rules
SET conditions = '[{"field": "event_end_datetime", "value": "3_days_ago", "operator": "before"}, {"field": "other_revenue_updated_at", "value": null, "operator": "eq"}]',
    updated_at = now()
WHERE rule_id = 'no_other_revenue_recorded';

UPDATE event_linter_rules
SET conditions = '[{"field": "event_end_datetime", "value": "3_days_ago", "operator": "before"}, {"field": "producer_tickets_updated_at", "value": null, "operator": "eq"}]',
    updated_at = now()
WHERE rule_id = 'no_ticket_revenue_recorded';

-- Fix event admins rule to only apply to future events
-- Problem: Rule was checking past events for admin count (context: always)
-- Solution: Change context to future_event so it only applies to upcoming events

UPDATE event_linter_rules
SET context = 'future_event',
    updated_at = now()
WHERE rule_id = 'event_admins_critical';

-- Add helpful comments
COMMENT ON TABLE event_linter_rules IS 'Event Linter rules with conditions and contexts. Rules check for issues with events, artists, and event data.';
