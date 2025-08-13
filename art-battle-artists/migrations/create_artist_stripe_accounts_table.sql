-- Create artist_stripe_accounts table for Stripe Connect integration
CREATE TABLE IF NOT EXISTS artist_stripe_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_profile_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
    
    -- Stripe Connect fields
    stripe_account_id TEXT UNIQUE,
    stripe_account_type TEXT CHECK (stripe_account_type IN ('standard', 'express', 'custom')),
    
    -- Account status
    onboarding_status TEXT DEFAULT 'not_started' CHECK (onboarding_status IN ('not_started', 'pending', 'completed', 'restricted', 'rejected')),
    charges_enabled BOOLEAN DEFAULT false,
    payouts_enabled BOOLEAN DEFAULT false,
    details_submitted BOOLEAN DEFAULT false,
    
    -- Account information
    country TEXT,
    currency TEXT,
    business_type TEXT,
    
    -- Onboarding URLs
    onboarding_url TEXT,
    onboarding_url_expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Additional metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    UNIQUE(artist_profile_id)
);

-- Create indexes
CREATE INDEX idx_artist_stripe_accounts_artist_profile ON artist_stripe_accounts(artist_profile_id);
CREATE INDEX idx_artist_stripe_accounts_stripe_id ON artist_stripe_accounts(stripe_account_id) WHERE stripe_account_id IS NOT NULL;
CREATE INDEX idx_artist_stripe_accounts_status ON artist_stripe_accounts(onboarding_status);

-- Create artist_payments table to track payments to artists
CREATE TABLE IF NOT EXISTS artist_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_profile_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
    art_id UUID NOT NULL REFERENCES art(id) ON DELETE CASCADE,
    payment_processing_id UUID REFERENCES payment_processing(id),
    
    -- Payment details
    gross_amount NUMERIC(10,2) NOT NULL, -- Amount buyer paid
    platform_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00, -- Our commission
    stripe_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00, -- Stripe's fees
    net_amount NUMERIC(10,2) NOT NULL, -- Amount artist receives
    currency VARCHAR(3) NOT NULL,
    
    -- Payment status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'cancelled')),
    
    -- Stripe Connect payout details
    stripe_transfer_id TEXT,
    stripe_payout_id TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    paid_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    
    UNIQUE(art_id) -- One payment record per artwork
);

-- Create indexes
CREATE INDEX idx_artist_payments_artist_profile ON artist_payments(artist_profile_id);
CREATE INDEX idx_artist_payments_art_id ON artist_payments(art_id);
CREATE INDEX idx_artist_payments_payment_processing ON artist_payments(payment_processing_id);
CREATE INDEX idx_artist_payments_status ON artist_payments(status);
CREATE INDEX idx_artist_payments_created_at ON artist_payments(created_at DESC);

-- Add RLS policies
ALTER TABLE artist_stripe_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_payments ENABLE ROW LEVEL SECURITY;

-- Artists can only see and manage their own Stripe accounts
CREATE POLICY "artists_own_stripe_accounts" ON artist_stripe_accounts
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM artist_profiles 
            WHERE artist_profiles.id = artist_stripe_accounts.artist_profile_id
            AND artist_profiles.person_id = (auth.jwt() ->> 'user_metadata')::jsonb ->> 'person_id'
        )
    );

-- Artists can only see their own payment records
CREATE POLICY "artists_own_payments" ON artist_payments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM artist_profiles 
            WHERE artist_profiles.id = artist_payments.artist_profile_id
            AND artist_profiles.person_id = (auth.jwt() ->> 'user_metadata')::jsonb ->> 'person_id'
        )
    );

-- Admins can view payments for their events
CREATE POLICY "admins_view_event_artist_payments" ON artist_payments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM payment_processing pp
            JOIN event_admins ea ON ea.event_id = pp.event_id
            WHERE pp.id = artist_payments.payment_processing_id
            AND ea.phone = auth.jwt()->>'phone'
        )
    );

-- Update trigger for artist_stripe_accounts
CREATE TRIGGER update_artist_stripe_accounts_updated_at
    BEFORE UPDATE ON artist_stripe_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to get artist payment status for artwork
CREATE OR REPLACE FUNCTION get_artist_payment_status(p_art_id UUID)
RETURNS TABLE (
    payment_status TEXT,
    gross_amount NUMERIC,
    net_amount NUMERIC,
    currency VARCHAR,
    paid_at TIMESTAMP WITH TIME ZONE,
    has_buyer_payment BOOLEAN,
    buyer_payment_status TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(ap.status, 'no_payment') as payment_status,
        ap.gross_amount,
        ap.net_amount,
        ap.currency,
        ap.paid_at,
        (pp.id IS NOT NULL) as has_buyer_payment,
        pp.status as buyer_payment_status
    FROM art a
    LEFT JOIN artist_payments ap ON ap.art_id = a.id
    LEFT JOIN payment_processing pp ON pp.art_id = a.id AND pp.status = 'completed'
    WHERE a.id = p_art_id;
END;
$$ LANGUAGE plpgsql;

-- Create view for artist activity with payment status
CREATE OR REPLACE VIEW artist_activity_with_payments AS
SELECT 
    a.id as art_id,
    a.art_code,
    a.title,
    a.status as art_status,
    a.current_bid,
    a.created_at as art_created_at,
    e.title as event_title,
    e.event_date,
    ap.artist_profile_id,
    
    -- Payment status logic
    CASE 
        WHEN a.current_bid IS NULL OR a.current_bid = 0 THEN 'no_bids'
        WHEN a.status = 'available' THEN 'available'
        WHEN pp.status = 'completed' AND artist_pay.status = 'paid' THEN 'artist_paid'
        WHEN pp.status = 'completed' AND (artist_pay.status IS NULL OR artist_pay.status != 'paid') THEN 'buyer_paid'
        WHEN a.status IN ('sold', 'paid') AND (pp.status IS NULL OR pp.status != 'completed') THEN 'closed_unpaid'
        ELSE 'unknown'
    END as payment_status,
    
    -- Payment amounts
    pp.amount_with_tax as buyer_paid_amount,
    artist_pay.net_amount as artist_net_amount,
    artist_pay.paid_at as artist_paid_at,
    pp.completed_at as buyer_paid_at,
    
    pp.currency
FROM art a
JOIN artist_profiles ap ON ap.id = a.artist_profile_id
JOIN events e ON e.id = a.event_id
LEFT JOIN payment_processing pp ON pp.art_id = a.id AND pp.status = 'completed'
LEFT JOIN artist_payments artist_pay ON artist_pay.art_id = a.id
ORDER BY a.created_at DESC;

-- Grant permissions
GRANT SELECT ON artist_activity_with_payments TO authenticated;