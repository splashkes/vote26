-- Add food & beverage and other revenue fields to events table

-- Food & Beverage Revenue
ALTER TABLE events ADD COLUMN IF NOT EXISTS food_beverage_revenue NUMERIC(10,2) DEFAULT 0;
ALTER TABLE events ADD COLUMN IF NOT EXISTS food_beverage_currency VARCHAR(3) DEFAULT 'USD';
ALTER TABLE events ADD COLUMN IF NOT EXISTS food_beverage_updated_by TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS food_beverage_updated_at TIMESTAMP WITH TIME ZONE;

-- All Other Revenue (merch, funding, sponsorship, etc.)
ALTER TABLE events ADD COLUMN IF NOT EXISTS other_revenue NUMERIC(10,2) DEFAULT 0;
ALTER TABLE events ADD COLUMN IF NOT EXISTS other_revenue_currency VARCHAR(3) DEFAULT 'USD';
ALTER TABLE events ADD COLUMN IF NOT EXISTS other_revenue_updated_by TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS other_revenue_updated_at TIMESTAMP WITH TIME ZONE;

-- Indexes for reporting queries
CREATE INDEX IF NOT EXISTS idx_events_food_beverage_revenue ON events(food_beverage_revenue) WHERE food_beverage_revenue > 0;
CREATE INDEX IF NOT EXISTS idx_events_other_revenue ON events(other_revenue) WHERE other_revenue > 0;

COMMENT ON COLUMN events.food_beverage_revenue IS 'Food and beverage revenue for the event';
COMMENT ON COLUMN events.other_revenue IS 'Other revenue (merch, funding, sponsorship, etc.)';
