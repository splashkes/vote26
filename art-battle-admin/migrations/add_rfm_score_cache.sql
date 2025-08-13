-- Create RFM score cache table
CREATE TABLE IF NOT EXISTS rfm_score_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    recency_score INTEGER NOT NULL CHECK (recency_score >= 1 AND recency_score <= 5),
    frequency_score INTEGER NOT NULL CHECK (frequency_score >= 1 AND frequency_score <= 5),
    monetary_score INTEGER NOT NULL CHECK (monetary_score >= 1 AND monetary_score <= 5),
    total_score INTEGER NOT NULL CHECK (total_score >= 3 AND total_score <= 15),
    segment TEXT NOT NULL,
    segment_code CHAR(3) NOT NULL,
    days_since_last_activity INTEGER NOT NULL,
    total_activities INTEGER NOT NULL,
    total_spent DECIMAL(10,2) NOT NULL DEFAULT 0,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create unique index on person_id for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_rfm_score_cache_person_id ON rfm_score_cache(person_id);

-- Create index on calculated_at for TTL checks
CREATE INDEX IF NOT EXISTS idx_rfm_score_cache_calculated_at ON rfm_score_cache(calculated_at);

-- Create index on segment_code for analytics
CREATE INDEX IF NOT EXISTS idx_rfm_score_cache_segment_code ON rfm_score_cache(segment_code);

-- Add RLS policies
ALTER TABLE rfm_score_cache ENABLE ROW LEVEL SECURITY;

-- Policy for service role (edge functions)
CREATE POLICY "Service role can do everything on rfm_score_cache"
ON rfm_score_cache
USING (auth.role() = 'service_role');

-- Policy for super admins to read RFM scores
CREATE POLICY "Super admins can read all rfm scores" 
FOR SELECT 
ON rfm_score_cache
TO authenticated
USING (is_super_admin());

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_rfm_score_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rfm_score_cache_updated_at
    BEFORE UPDATE ON rfm_score_cache
    FOR EACH ROW
    EXECUTE FUNCTION update_rfm_score_cache_updated_at();