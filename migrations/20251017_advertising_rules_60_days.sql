-- Update advertising linter rules to trigger earlier (60 days instead of 45)
-- Created: 2025-10-17
-- Purpose: Give more lead time for advertising planning and campaign setup

-- Update existing rule: Ad Budget Not Set - trigger at 60 days instead of 45
UPDATE event_linter_rules
SET conditions = '[
  {"field": "event_start_datetime", "value": 60, "operator": "upcoming_days"},
  {"field": "meta_ads_budget", "operator": "is_null"},
  {"field": "other_ads_budget", "operator": "is_null"}
]'::jsonb
WHERE rule_id = 'advertising_budget_not_set_info';

-- Create new rule: Ads Should Be Running
-- Triggers when event has budget allocated but needs campaigns to be started
-- Active window: 7-60 days before event
INSERT INTO event_linter_rules (
  rule_id,
  name,
  description,
  severity,
  category,
  context,
  conditions,
  message,
  status
) VALUES (
  'ads_need_to_start',
  'Ads Should Be Running',
  'Event has advertising budget allocated but ads should be started soon',
  'warning',
  'marketing',
  'pre_event',
  '[
    {"field": "event_start_datetime", "value": 60, "operator": "upcoming_days"},
    {"field": "event_start_datetime", "value": 7, "operator": "upcoming_days_more_than"},
    {"field": "meta_ads_budget", "operator": "is_not_null"}
  ]'::jsonb,
  '📢 Event in {{days_until}} days with ${{meta_ads_budget}} budget - time to start Meta ads campaigns!',
  'active'
)
ON CONFLICT (rule_id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  severity = EXCLUDED.severity,
  conditions = EXCLUDED.conditions,
  message = EXCLUDED.message,
  status = 'active';
