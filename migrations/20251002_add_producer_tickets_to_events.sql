-- Add tickets sold by producer field to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS producer_tickets_sold NUMERIC(10,2) DEFAULT 0;
ALTER TABLE events ADD COLUMN IF NOT EXISTS producer_tickets_currency VARCHAR(3) DEFAULT 'USD';
ALTER TABLE events ADD COLUMN IF NOT EXISTS producer_tickets_updated_by TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS producer_tickets_updated_at TIMESTAMP WITH TIME ZONE;

-- Add index for querying
CREATE INDEX IF NOT EXISTS idx_events_producer_tickets ON events(producer_tickets_sold) WHERE producer_tickets_sold > 0;

COMMENT ON COLUMN events.producer_tickets_sold IS 'Amount of tickets sold by local producer (for reconciliation)';
COMMENT ON COLUMN events.producer_tickets_currency IS 'Currency of tickets sold by producer';
COMMENT ON COLUMN events.producer_tickets_updated_by IS 'Email of admin who last updated producer tickets';
COMMENT ON COLUMN events.producer_tickets_updated_at IS 'When producer tickets were last updated';
