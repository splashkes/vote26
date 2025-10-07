-- Add validation rule for events without tax rate set

INSERT INTO event_linter_rules (rule_id, name, severity, category, context, conditions, message, description)
VALUES (
  'no_tax_rate_warning',
  'No Tax Rate Set',
  'warning',
  'operational',
  'pre_event',
  '[
    {"field": "event_start_datetime", "value": 14, "operator": "upcoming_days"},
    {"field": "tax", "value": 0, "operator": "lte"}
  ]'::jsonb,
  'No tax rate set for auction sales',
  'Event is within 14 days but has no tax rate configured. Tax should be set for auction sales compliance.'
);
