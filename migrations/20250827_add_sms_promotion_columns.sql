-- SMS Promotion System - Database Schema Updates
-- Date: August 27, 2025
-- Purpose: Add columns to existing SMS tables for promotion campaign tracking

-- Add campaign tracking to sms_outbound table
ALTER TABLE sms_outbound 
ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES sms_marketing_campaigns(id) ON DELETE SET NULL;

-- Add campaign metadata to sms_marketing_campaigns table
ALTER TABLE sms_marketing_campaigns 
ADD COLUMN IF NOT EXISTS targeting_criteria JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS total_cost_cents INTEGER DEFAULT 0;

-- Create index on campaign_id for efficient lookups
CREATE INDEX IF NOT EXISTS idx_sms_outbound_campaign_id ON sms_outbound(campaign_id);

-- Create index on targeting_criteria for campaign analysis
CREATE INDEX IF NOT EXISTS idx_sms_campaigns_targeting ON sms_marketing_campaigns USING GIN(targeting_criteria);

-- Add comments for documentation
COMMENT ON COLUMN sms_outbound.campaign_id IS 'Links individual SMS messages to promotion campaigns';
COMMENT ON COLUMN sms_marketing_campaigns.targeting_criteria IS 'JSON object storing audience filters: cities, events, RFM ranges';
COMMENT ON COLUMN sms_marketing_campaigns.total_cost_cents IS 'Total campaign cost in cents, aggregated from message costs';