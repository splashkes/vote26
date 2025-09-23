-- Create payment reminders tracking table
CREATE TABLE IF NOT EXISTS payment_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    art_id UUID NOT NULL REFERENCES art(id) ON DELETE CASCADE,
    sent_to_person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    sent_by_admin UUID NOT NULL REFERENCES auth.users(id),
    message_content TEXT NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    sms_sid VARCHAR(100), -- Twilio SMS ID
    sms_status VARCHAR(20), -- queued, sent, delivered, failed, etc
    admin_note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for efficient queries
CREATE INDEX idx_payment_reminders_art_id ON payment_reminders(art_id);
CREATE INDEX idx_payment_reminders_person_id ON payment_reminders(sent_to_person_id);
CREATE INDEX idx_payment_reminders_admin ON payment_reminders(sent_by_admin);
CREATE INDEX idx_payment_reminders_created_at ON payment_reminders(created_at DESC);

-- Add update trigger
CREATE TRIGGER update_payment_reminders_updated_at
    BEFORE UPDATE ON payment_reminders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add RLS policies
ALTER TABLE payment_reminders ENABLE ROW LEVEL SECURITY;

-- Admins can view reminders for their events
CREATE POLICY "Admins can view event reminders" ON payment_reminders
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM event_admins ea
            JOIN art a ON a.event_id = ea.event_id
            WHERE a.id = payment_reminders.art_id
            AND ea.phone = auth.jwt() ->> 'phone'
        )
    );

-- Admins can create reminders for their events
CREATE POLICY "Admins can create event reminders" ON payment_reminders
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM event_admins ea
            JOIN art a ON a.event_id = ea.event_id
            WHERE a.id = payment_reminders.art_id
            AND ea.phone = auth.jwt() ->> 'phone'
        )
        AND sent_by_admin = auth.uid()
    );

-- Comment on table
COMMENT ON TABLE payment_reminders IS 'Tracks payment reminder SMS messages sent by admins to winning bidders';