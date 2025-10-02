-- Migration: Artist Manual Payment Requests
-- Purpose: Track manual payment requests from artists who cannot use Stripe
-- Date: 2025-10-02

-- Create artist_manual_payment_requests table
CREATE TABLE IF NOT EXISTS artist_manual_payment_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_profile_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,

    -- Request details
    payment_method VARCHAR(50), -- 'zelle', 'swift', 'paypal', 'interac', 'cashapp', 'other'
    payment_details TEXT NOT NULL, -- Free-form text with banking/transfer info
    country_code VARCHAR(3), -- ISO country code for country-specific handling
    preferred_currency VARCHAR(3), -- Preferred currency for payment

    -- Status tracking
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'in_review', 'approved', 'paid', 'rejected'
    admin_notes TEXT, -- Internal notes from admin team
    processed_by UUID REFERENCES people(id), -- Admin who processed the request
    processed_at TIMESTAMP WITH TIME ZONE,

    -- Metadata
    requested_amount DECIMAL(10,2), -- Amount artist is requesting (from their balance)
    events_referenced TEXT[], -- Array of event IDs or names they're claiming payment for

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_manual_payment_requests_artist ON artist_manual_payment_requests(artist_profile_id);
CREATE INDEX idx_manual_payment_requests_person ON artist_manual_payment_requests(person_id);
CREATE INDEX idx_manual_payment_requests_status ON artist_manual_payment_requests(status);
CREATE INDEX idx_manual_payment_requests_created ON artist_manual_payment_requests(created_at);

-- Partial unique index: only one pending request per artist
CREATE UNIQUE INDEX idx_unique_pending_request
    ON artist_manual_payment_requests(artist_profile_id)
    WHERE status = 'pending';

-- Add RLS policies
ALTER TABLE artist_manual_payment_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own requests
CREATE POLICY "Users can view their own manual payment requests"
    ON artist_manual_payment_requests
    FOR SELECT
    TO authenticated
    USING (person_id = (current_setting('request.jwt.claims', true)::json->>'person_id')::uuid);

-- Users can insert their own requests
CREATE POLICY "Users can create manual payment requests"
    ON artist_manual_payment_requests
    FOR INSERT
    TO authenticated
    WITH CHECK (person_id = (current_setting('request.jwt.claims', true)::json->>'person_id')::uuid);

-- Users can update their own pending requests only
CREATE POLICY "Users can update their own pending requests"
    ON artist_manual_payment_requests
    FOR UPDATE
    TO authenticated
    USING (
        person_id = (current_setting('request.jwt.claims', true)::json->>'person_id')::uuid
        AND status = 'pending'
    );

-- Service role can do everything (for admin interface)
CREATE POLICY "Service role full access to manual payment requests"
    ON artist_manual_payment_requests
    FOR ALL
    TO service_role
    USING (true);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON artist_manual_payment_requests TO authenticated;
GRANT ALL ON artist_manual_payment_requests TO service_role;

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_artist_manual_payment_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_artist_manual_payment_requests_updated_at
    BEFORE UPDATE ON artist_manual_payment_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_artist_manual_payment_requests_updated_at();

COMMENT ON TABLE artist_manual_payment_requests IS 'Manual payment requests from artists who cannot use Stripe';
COMMENT ON COLUMN artist_manual_payment_requests.payment_method IS 'Payment method preference: zelle, swift, paypal, interac, cashapp, other';
COMMENT ON COLUMN artist_manual_payment_requests.payment_details IS 'Free-form text with banking/transfer info from artist';
COMMENT ON COLUMN artist_manual_payment_requests.status IS 'Request status: pending, in_review, approved, paid, rejected';
