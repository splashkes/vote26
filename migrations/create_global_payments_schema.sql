-- Global Payments Migration Schema
-- Transition from Stripe Connect to Stripe Global Payouts
-- Date: 2025-09-09

-- Create artist_global_payments table for Global Payouts recipients
CREATE TABLE IF NOT EXISTS artist_global_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_profile_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
    
    -- Stripe Global Payouts fields
    stripe_recipient_id TEXT UNIQUE, -- Recipient ID from Stripe Global Payouts
    
    -- Migration mapping
    legacy_stripe_connect_account_id TEXT, -- Maps to old artist_stripe_accounts.stripe_account_id
    migration_completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Recipient status
    status TEXT DEFAULT 'invited' CHECK (status IN ('invited', 'in_review', 'ready', 'blocked', 'rejected')),
    
    -- Recipient information  
    country CHAR(2) NOT NULL,
    default_currency CHAR(3) NOT NULL DEFAULT 'USD',
    
    -- Onboarding URLs (Global Payouts uses hosted forms)
    onboarding_url TEXT,
    onboarding_url_expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Additional metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    UNIQUE(artist_profile_id) -- One Global Payments account per artist profile
);

-- Create global_payment_requests table for tracking payouts
CREATE TABLE IF NOT EXISTS global_payment_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_profile_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
    art_id UUID NOT NULL REFERENCES art(id) ON DELETE CASCADE,
    payment_processing_id UUID REFERENCES payment_processing(id),
    
    -- Stripe Global Payouts fields
    stripe_recipient_id TEXT NOT NULL, -- Links to artist_global_payments.stripe_recipient_id
    stripe_payout_id TEXT UNIQUE, -- Payout ID from Stripe
    
    -- Payment details
    amount_minor BIGINT NOT NULL, -- Amount in smallest currency unit (cents)
    currency CHAR(3) NOT NULL,
    
    -- Payout status
    status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'paid', 'canceled')),
    
    -- Error handling
    error_code TEXT,
    error_message TEXT,
    
    -- Idempotency (critical for Global Payouts)
    idempotency_key UUID NOT NULL DEFAULT gen_random_uuid(),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE, -- When payout was sent
    paid_at TIMESTAMP WITH TIME ZONE, -- When recipient received funds
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    UNIQUE(art_id), -- One payout request per artwork
    UNIQUE(idempotency_key) -- Ensure no duplicate payouts
);

-- Create indexes for performance
CREATE INDEX idx_artist_global_payments_artist_profile ON artist_global_payments(artist_profile_id);
CREATE INDEX idx_artist_global_payments_recipient_id ON artist_global_payments(stripe_recipient_id) WHERE stripe_recipient_id IS NOT NULL;
CREATE INDEX idx_artist_global_payments_status ON artist_global_payments(status);
CREATE INDEX idx_artist_global_payments_legacy_mapping ON artist_global_payments(legacy_stripe_connect_account_id) WHERE legacy_stripe_connect_account_id IS NOT NULL;

CREATE INDEX idx_global_payment_requests_artist_profile ON global_payment_requests(artist_profile_id);
CREATE INDEX idx_global_payment_requests_art_id ON global_payment_requests(art_id);
CREATE INDEX idx_global_payment_requests_recipient_id ON global_payment_requests(stripe_recipient_id);
CREATE INDEX idx_global_payment_requests_status ON global_payment_requests(status);
CREATE INDEX idx_global_payment_requests_created_at ON global_payment_requests(created_at DESC);
CREATE INDEX idx_global_payment_requests_idempotency ON global_payment_requests(idempotency_key);

-- Add RLS policies
ALTER TABLE artist_global_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_payment_requests ENABLE ROW LEVEL SECURITY;

-- Artists can only see and manage their own Global Payments accounts
CREATE POLICY "artists_own_global_payments" ON artist_global_payments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM artist_profiles 
            WHERE artist_profiles.id = artist_global_payments.artist_profile_id
            AND artist_profiles.person_id = (auth.jwt() ->> 'person_id')::uuid
        )
    );

-- Artists can only see their own payout requests
CREATE POLICY "artists_own_global_payment_requests" ON global_payment_requests
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM artist_profiles 
            WHERE artist_profiles.id = global_payment_requests.artist_profile_id
            AND artist_profiles.person_id = (auth.jwt() ->> 'person_id')::uuid
        )
    );

-- Admins can view payout requests for their events
CREATE POLICY "admins_view_event_global_payment_requests" ON global_payment_requests
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM payment_processing pp
            JOIN event_admins ea ON ea.event_id = pp.event_id
            WHERE pp.id = global_payment_requests.payment_processing_id
            AND ea.phone = auth.jwt()->>'phone'
        )
    );

-- Update trigger for artist_global_payments
CREATE TRIGGER update_artist_global_payments_updated_at
    BEFORE UPDATE ON artist_global_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to get Global Payments status for artwork
CREATE OR REPLACE FUNCTION get_global_payment_status(p_art_id UUID)
RETURNS TABLE (
    payment_status TEXT,
    amount_minor BIGINT,
    currency VARCHAR,
    sent_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    has_buyer_payment BOOLEAN,
    buyer_payment_status TEXT,
    stripe_payout_id TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(gpr.status, 'no_payment') as payment_status,
        gpr.amount_minor,
        gpr.currency,
        gpr.sent_at,
        gpr.paid_at,
        (pp.id IS NOT NULL) as has_buyer_payment,
        pp.status as buyer_payment_status,
        gpr.stripe_payout_id
    FROM art a
    LEFT JOIN global_payment_requests gpr ON gpr.art_id = a.id
    LEFT JOIN payment_processing pp ON pp.art_id = a.id AND pp.status = 'completed'
    WHERE a.id = p_art_id;
END;
$$ LANGUAGE plpgsql;

-- Create view for artist activity with Global Payments status
CREATE OR REPLACE VIEW artist_activity_with_global_payments AS
SELECT 
    a.id as art_id,
    a.art_code,
    NULL as title, -- art table doesn't have title column
    a.status as art_status,
    a.current_bid,
    a.created_at as art_created_at,
    e.name as event_title,
    e.event_start_datetime as event_date,
    a.artist_id,
    
    -- Payment status logic for Global Payments
    CASE 
        WHEN a.current_bid IS NULL OR a.current_bid = 0 THEN 'no_bids'
        WHEN a.status = 'available' THEN 'available'
        WHEN pp.status = 'completed' AND gpr.status = 'paid' THEN 'artist_paid'
        WHEN pp.status = 'completed' AND gpr.status IN ('queued', 'sent') THEN 'payout_in_progress'
        WHEN pp.status = 'completed' AND (gpr.status IS NULL OR gpr.status = 'failed') THEN 'buyer_paid'
        WHEN a.status IN ('sold', 'paid') AND (pp.status IS NULL OR pp.status != 'completed') THEN 'closed_unpaid'
        ELSE 'unknown'
    END as payment_status,
    
    -- Payment amounts (Global Payouts uses minor currency units)
    pp.amount_with_tax as buyer_paid_amount,
    (gpr.amount_minor::DECIMAL / 100) as artist_payout_amount, -- Convert from cents to dollars
    gpr.paid_at as artist_paid_at,
    gpr.sent_at as payout_sent_at,
    pp.completed_at as buyer_paid_at,
    gpr.status as global_payout_status,
    
    pp.currency
FROM art a
JOIN events e ON e.id = a.event_id
LEFT JOIN payment_processing pp ON pp.art_id = a.id AND pp.status = 'completed'
LEFT JOIN global_payment_requests gpr ON gpr.art_id = a.id
ORDER BY a.created_at DESC;

-- Create function to migrate Connect account to Global Payments
CREATE OR REPLACE FUNCTION migrate_connect_to_global_payments(
    p_artist_profile_id UUID,
    p_stripe_recipient_id TEXT,
    p_country CHAR(2) DEFAULT 'US',
    p_currency CHAR(3) DEFAULT 'USD'
)
RETURNS UUID AS $$
DECLARE
    v_global_payment_id UUID;
    v_connect_account_id TEXT;
BEGIN
    -- Get existing Connect account ID for mapping
    SELECT stripe_account_id INTO v_connect_account_id
    FROM artist_stripe_accounts
    WHERE artist_profile_id = p_artist_profile_id;
    
    -- Insert new Global Payments record
    INSERT INTO artist_global_payments (
        artist_profile_id,
        stripe_recipient_id,
        legacy_stripe_connect_account_id,
        country,
        default_currency,
        status,
        migration_completed_at,
        metadata
    ) VALUES (
        p_artist_profile_id,
        p_stripe_recipient_id,
        v_connect_account_id,
        p_country,
        p_currency,
        'ready', -- Assume recipient is ready when migrating
        NOW(),
        jsonb_build_object(
            'migrated_from_connect', true,
            'migration_date', NOW()::text
        )
    ) RETURNING id INTO v_global_payment_id;
    
    RETURN v_global_payment_id;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT SELECT ON artist_activity_with_global_payments TO authenticated;
GRANT EXECUTE ON FUNCTION get_global_payment_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION migrate_connect_to_global_payments(UUID, TEXT, CHAR, CHAR) TO authenticated;

-- Add comments for clarity
COMMENT ON TABLE artist_global_payments IS 'Stripe Global Payouts recipient accounts for artists - replaces artist_stripe_accounts';
COMMENT ON TABLE global_payment_requests IS 'Individual payout requests using Global Payouts - replaces artist_payments';
COMMENT ON COLUMN artist_global_payments.legacy_stripe_connect_account_id IS 'Maps to old Stripe Connect account for migration tracking';
COMMENT ON COLUMN global_payment_requests.idempotency_key IS 'Critical for preventing duplicate payouts in Global Payouts system';