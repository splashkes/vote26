-- Fix all_artists_booked_success rule to show days from last confirmation, not today
-- Date: 2025-10-08
-- Issue: Success message was counting from today's date, not the date of last confirmation

UPDATE event_linter_rules
SET message = 'All {{confirmed_artists_count}} artists confirmed {{days_from_last_confirmation_to_event}} days before the event - fully booked!',
    updated_at = now()
WHERE rule_id = 'all_artists_booked_success';

-- Verify the change
-- SELECT rule_id, name, message FROM event_linter_rules WHERE rule_id = 'all_artists_booked_success';
