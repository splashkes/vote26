-- Add event planning validation rules to Event Linter
-- These rules validate the new event planning fields added in 20251006_add_event_planning_fields.sql

INSERT INTO event_linter_rules (rule_id, name, severity, category, context, message, conditions, status) VALUES

-- Critical: Event must be approved before going live
('event_not_approved_error', 'Event Not Approved', 'error', 'pre-event', 'pre_event',
 'Event not approved - must have approval within 14 days of event',
 '[{"field": "event_start_datetime", "operator": "upcoming_days", "value": 14}, {"field": "event_info_approved_at", "operator": "is_null"}]'::jsonb, 'active'),

-- Warning: Venue should be set well before event
('venue_not_set_warning', 'Venue Not Set', 'warning', 'pre-event', 'pre_event',
 'Venue not assigned - set venue within 30 days of event',
 '[{"field": "event_start_datetime", "operator": "upcoming_days", "value": 30}, {"field": "venue_id", "operator": "is_null"}]'::jsonb, 'active'),

-- Reminder: Event folder should be created for organization
('event_folder_missing_reminder', 'Event Folder Missing', 'reminder', 'pre-event', 'pre_event',
 'Event folder link not set - create Google Drive folder for event materials',
 '[{"field": "event_start_datetime", "operator": "upcoming_days", "value": 21}, {"field": "event_folder_link", "operator": "is_null"}]'::jsonb, 'active'),

-- Info: Budget tracking is helpful
('advertising_budget_not_set_info', 'Ad Budget Not Set', 'info', 'pre-event', 'pre_event',
 'Advertising budget not set - consider setting Meta and/or other ads budget for tracking',
 '[{"field": "event_start_datetime", "operator": "upcoming_days", "value": 45}, {"field": "meta_ads_budget", "operator": "is_null"}, {"field": "other_ads_budget", "operator": "is_null"}]'::jsonb, 'active'),

-- Info: Event planning defaults should be reviewed
('event_planning_defaults_info', 'Event Planning Defaults', 'info', 'pre-event', 'pre_event',
 'Event planning: {{target_artists_booked}} artists, {{expected_number_of_rounds}} rounds, wildcard: {{wildcard_expected}}',
 '[{"field": "event_start_datetime", "operator": "upcoming_days", "value": 60}, {"field": "target_artists_booked", "operator": "is_not_null"}]'::jsonb, 'active')

ON CONFLICT (rule_id) DO UPDATE SET
  name = EXCLUDED.name,
  severity = EXCLUDED.severity,
  category = EXCLUDED.category,
  context = EXCLUDED.context,
  message = EXCLUDED.message,
  conditions = EXCLUDED.conditions,
  status = EXCLUDED.status;
