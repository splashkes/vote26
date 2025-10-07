-- Add validation rule for meta ads budget without active campaigns
-- This rule checks if an event has a meta_ads_budget set but no active Meta ad campaigns running

INSERT INTO event_linter_rules (rule_id, name, severity, category, context, conditions, message, description)
VALUES (
  'meta_ads_budget_no_campaigns',
  'Meta Ads Budget Set But No Campaigns',
  'warning',
  'active',
  'active_event',
  '[]'::jsonb,
  'Meta ads budget set but no active campaigns found',
  'Event has meta_ads_budget configured but no active Meta ad campaigns were found. This check uses cached data up to 24 hours old. Custom logic in edge function handles the actual campaign verification.'
);
