-- Create event_linter_rules table to store linter rules
CREATE TABLE IF NOT EXISTS event_linter_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('error', 'warning', 'info', 'success')),
  category TEXT NOT NULL,
  context TEXT NOT NULL,
  conditions JSONB DEFAULT '[]'::jsonb,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  hit_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on rule_id for faster lookups
CREATE INDEX idx_event_linter_rules_rule_id ON event_linter_rules(rule_id);

-- Create index on status for filtering active rules
CREATE INDEX idx_event_linter_rules_status ON event_linter_rules(status);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_event_linter_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
CREATE TRIGGER event_linter_rules_updated_at
  BEFORE UPDATE ON event_linter_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_event_linter_rules_updated_at();

-- Create function to increment hit count
CREATE OR REPLACE FUNCTION increment_rule_hit_count(p_rule_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE event_linter_rules
  SET hit_count = hit_count + 1
  WHERE rule_id = p_rule_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE event_linter_rules IS 'Event linter rules with metadata and hit tracking';
COMMENT ON COLUMN event_linter_rules.rule_id IS 'Unique identifier for the rule (e.g., artist_payment_overdue)';
COMMENT ON COLUMN event_linter_rules.conditions IS 'JSONB array of condition objects';
COMMENT ON COLUMN event_linter_rules.status IS 'active or inactive - only active rules are evaluated';
COMMENT ON COLUMN event_linter_rules.hit_count IS 'Number of times this rule has triggered findings';
