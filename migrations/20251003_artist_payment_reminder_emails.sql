-- Create table to track payment reminder emails sent to artists
-- Prevents duplicate sends and allows monitoring of email campaigns

CREATE TABLE IF NOT EXISTS artist_payment_reminder_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_profile_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  email_type VARCHAR(50) NOT NULL, -- '1_day_no_stripe', '15_day_unpaid'
  email_address TEXT NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  email_data JSONB, -- Store event EID, amount, etc.
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_payment_reminder_emails_artist ON artist_payment_reminder_emails(artist_profile_id);
CREATE INDEX idx_payment_reminder_emails_person ON artist_payment_reminder_emails(person_id);
CREATE INDEX idx_payment_reminder_emails_event ON artist_payment_reminder_emails(event_id);
CREATE INDEX idx_payment_reminder_emails_type ON artist_payment_reminder_emails(email_type);
CREATE INDEX idx_payment_reminder_emails_sent ON artist_payment_reminder_emails(sent_at DESC);

-- Composite index for preventing duplicate sends
CREATE UNIQUE INDEX idx_payment_reminder_emails_unique
ON artist_payment_reminder_emails(artist_profile_id, event_id, email_type)
WHERE success = TRUE;

COMMENT ON TABLE artist_payment_reminder_emails IS 'Tracks payment reminder emails sent to artists to prevent duplicates';
COMMENT ON COLUMN artist_payment_reminder_emails.email_type IS '1_day_no_stripe = sent 1 day after event with no Stripe, 15_day_unpaid = sent 15 days after event if unpaid';
COMMENT ON COLUMN artist_payment_reminder_emails.email_data IS 'JSON data: {event_eid, amount_owed, event_city, event_date, paintings_sold}';
