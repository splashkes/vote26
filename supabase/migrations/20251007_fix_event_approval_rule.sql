-- Update event_not_approved_error to be a warning with better messaging

UPDATE event_linter_rules
SET
  severity = 'warning',
  message = 'Event basics not yet approved by producer - {{days_until}} days to event'
WHERE rule_id = 'event_not_approved_error';
