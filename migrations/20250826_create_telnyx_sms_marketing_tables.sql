-- Telnyx SMS Marketing System Database Tables
-- Date: August 26, 2025
-- Purpose: Independent SMS marketing system using Telnyx API

-- 1. SMS Outbound Log Table - Track all outbound marketing messages
CREATE TABLE IF NOT EXISTS sms_outbound (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telnyx_message_id TEXT, -- Telnyx API message ID
    campaign_id UUID, -- Optional link to campaign
    template_id UUID, -- Optional link to template
    to_phone TEXT NOT NULL,
    from_phone TEXT NOT NULL,
    message_body TEXT NOT NULL,
    character_count INTEGER,
    message_parts INTEGER DEFAULT 1,
    status TEXT DEFAULT 'pending', -- pending, sent, delivered, failed, undelivered
    telnyx_status TEXT, -- Raw status from Telnyx
    cost_cents INTEGER, -- Cost in cents if available
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. SMS Inbound Log Table - Track all inbound marketing responses
CREATE TABLE IF NOT EXISTS sms_inbound (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telnyx_message_id TEXT UNIQUE, -- Telnyx webhook message ID
    from_phone TEXT NOT NULL,
    to_phone TEXT NOT NULL,
    message_body TEXT NOT NULL,
    character_count INTEGER,
    direction TEXT DEFAULT 'inbound',
    telnyx_data JSONB, -- Full webhook payload
    is_stop_request BOOLEAN DEFAULT FALSE, -- Detected opt-out
    is_help_request BOOLEAN DEFAULT FALSE, -- Detected help request
    auto_replied BOOLEAN DEFAULT FALSE,
    processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. SMS Logs Table - Comprehensive audit trail
CREATE TABLE IF NOT EXISTS sms_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_type TEXT NOT NULL, -- 'outbound', 'inbound', 'webhook', 'error'
    related_id UUID, -- Link to sms_outbound or sms_inbound
    phone_number TEXT,
    action TEXT NOT NULL, -- 'sent', 'received', 'delivered', 'failed', 'webhook_received'
    status TEXT,
    message TEXT,
    metadata JSONB DEFAULT '{}',
    error_details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. SMS Marketing Templates Table
CREATE TABLE IF NOT EXISTS sms_marketing_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    message_template TEXT NOT NULL,
    variables JSONB DEFAULT '[]', -- Array of variable names like ["name", "event"]
    character_count INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    category TEXT, -- 'promotion', 'reminder', 'welcome', etc.
    created_by UUID, -- User who created template
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. SMS Marketing Campaigns Table
CREATE TABLE IF NOT EXISTS sms_marketing_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    template_id UUID REFERENCES sms_marketing_templates(id),
    status TEXT DEFAULT 'draft', -- draft, scheduled, sending, completed, paused
    recipient_list JSONB, -- Array of phone numbers or query criteria
    total_recipients INTEGER,
    messages_sent INTEGER DEFAULT 0,
    messages_delivered INTEGER DEFAULT 0,
    messages_failed INTEGER DEFAULT 0,
    replies_received INTEGER DEFAULT 0,
    opt_outs INTEGER DEFAULT 0,
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. SMS Opt-outs Table - Marketing compliance
CREATE TABLE IF NOT EXISTS sms_marketing_optouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number TEXT NOT NULL UNIQUE,
    opted_out_at TIMESTAMPTZ DEFAULT NOW(),
    opt_out_message TEXT,
    campaign_id UUID, -- Which campaign triggered opt-out
    source TEXT DEFAULT 'sms_reply', -- sms_reply, manual, api
    is_active BOOLEAN DEFAULT TRUE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sms_outbound_phone ON sms_outbound(to_phone);
CREATE INDEX IF NOT EXISTS idx_sms_outbound_status ON sms_outbound(status);
CREATE INDEX IF NOT EXISTS idx_sms_outbound_campaign ON sms_outbound(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sms_outbound_created ON sms_outbound(created_at);

CREATE INDEX IF NOT EXISTS idx_sms_inbound_phone ON sms_inbound(from_phone);
CREATE INDEX IF NOT EXISTS idx_sms_inbound_telnyx_id ON sms_inbound(telnyx_message_id);
CREATE INDEX IF NOT EXISTS idx_sms_inbound_created ON sms_inbound(created_at);

CREATE INDEX IF NOT EXISTS idx_sms_logs_type_action ON sms_logs(message_type, action);
CREATE INDEX IF NOT EXISTS idx_sms_logs_phone ON sms_logs(phone_number);
CREATE INDEX IF NOT EXISTS idx_sms_logs_created ON sms_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_sms_templates_active ON sms_marketing_templates(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_sms_campaigns_status ON sms_marketing_campaigns(status);

-- Update triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_sms_marketing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sms_outbound_updated_at
    BEFORE UPDATE ON sms_outbound
    FOR EACH ROW
    EXECUTE FUNCTION update_sms_marketing_updated_at();

CREATE TRIGGER update_sms_templates_updated_at
    BEFORE UPDATE ON sms_marketing_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_sms_marketing_updated_at();

CREATE TRIGGER update_sms_campaigns_updated_at
    BEFORE UPDATE ON sms_marketing_campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_sms_marketing_updated_at();

-- Row Level Security (RLS) - Basic setup
ALTER TABLE sms_outbound ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_inbound ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_marketing_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_marketing_optouts ENABLE ROW LEVEL SECURITY;

-- Service role can access all records
CREATE POLICY "Service role full access sms_outbound" ON sms_outbound
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access sms_inbound" ON sms_inbound
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access sms_logs" ON sms_logs
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access sms_templates" ON sms_marketing_templates
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access sms_campaigns" ON sms_marketing_campaigns
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access sms_optouts" ON sms_marketing_optouts
    FOR ALL USING (auth.role() = 'service_role');

-- Helper function to check if phone number is opted out
CREATE OR REPLACE FUNCTION is_phone_opted_out(phone_number TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM sms_marketing_optouts 
        WHERE phone_number = $1 AND is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to log SMS activity
CREATE OR REPLACE FUNCTION log_sms_activity(
    p_message_type TEXT,
    p_related_id UUID,
    p_phone_number TEXT,
    p_action TEXT,
    p_status TEXT DEFAULT NULL,
    p_message TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}',
    p_error_details TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    log_id UUID;
BEGIN
    INSERT INTO sms_logs (
        message_type, related_id, phone_number, action, 
        status, message, metadata, error_details
    ) VALUES (
        p_message_type, p_related_id, p_phone_number, p_action,
        p_status, p_message, p_metadata, p_error_details
    ) RETURNING id INTO log_id;
    
    RETURN log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment on tables for documentation
COMMENT ON TABLE sms_outbound IS 'Logs all outbound SMS marketing messages sent via Telnyx';
COMMENT ON TABLE sms_inbound IS 'Logs all inbound SMS responses received via Telnyx webhooks';
COMMENT ON TABLE sms_logs IS 'Comprehensive audit trail for all SMS marketing activities';
COMMENT ON TABLE sms_marketing_templates IS 'Reusable message templates for SMS marketing campaigns';
COMMENT ON TABLE sms_marketing_campaigns IS 'SMS marketing campaign management and tracking';
COMMENT ON TABLE sms_marketing_optouts IS 'Phone numbers that have opted out of SMS marketing';