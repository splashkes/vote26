-- Add Slack credentials to Supabase Vault
-- Run this in the Supabase SQL editor

-- First, ensure vault extension is enabled
CREATE EXTENSION IF NOT EXISTS pgsodium;

-- Add Slack credentials to vault
INSERT INTO vault.secrets (name, secret) VALUES 
('SLACK_BOT_TOKEN', 'REDACTED_SLACK_BOT_TOKEN'),
('SLACK_SIGNING_SECRET', 'REDACTED_SLACK_SIGNING_SECRET'),
('SLACK_APP_TOKEN', 'REDACTED_SLACK_APP_TOKEN')
ON CONFLICT (name) DO UPDATE SET secret = EXCLUDED.secret;

-- Verify credentials were added
SELECT name, created_at FROM vault.secrets 
WHERE name IN ('SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET', 'SLACK_APP_TOKEN');