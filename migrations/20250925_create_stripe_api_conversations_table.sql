-- Create table to log all Stripe API conversations for debugging and audit purposes
-- This will help track API calls, responses, and failures for payment processing

CREATE TABLE stripe_api_conversations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    payment_id uuid REFERENCES artist_payments(id) ON DELETE SET NULL,
    artist_profile_id uuid REFERENCES artist_profiles(id) ON DELETE CASCADE,
    stripe_account_id text,
    api_endpoint text NOT NULL,
    request_method text NOT NULL DEFAULT 'POST',
    request_headers jsonb,
    request_body jsonb,
    response_status integer,
    response_headers jsonb,
    response_body jsonb,
    error_message text,
    processing_duration_ms integer,
    created_at timestamp with time zone DEFAULT NOW(),
    created_by text DEFAULT 'system'
);

-- Add indexes for common queries
CREATE INDEX idx_stripe_api_conversations_payment_id ON stripe_api_conversations(payment_id);
CREATE INDEX idx_stripe_api_conversations_artist_profile_id ON stripe_api_conversations(artist_profile_id);
CREATE INDEX idx_stripe_api_conversations_created_at ON stripe_api_conversations(created_at);
CREATE INDEX idx_stripe_api_conversations_response_status ON stripe_api_conversations(response_status);

-- Add RLS policies
ALTER TABLE stripe_api_conversations ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read their own conversations
CREATE POLICY "Users can read stripe API conversations" ON stripe_api_conversations
    FOR SELECT USING (true); -- Admin interface needs to see all

-- Allow service role to insert and update
CREATE POLICY "Service role can manage stripe API conversations" ON stripe_api_conversations
    FOR ALL USING (auth.role() = 'service_role');

-- Add comment for documentation
COMMENT ON TABLE stripe_api_conversations IS 'Logs all Stripe API interactions for payment processing, debugging, and audit purposes';
COMMENT ON COLUMN stripe_api_conversations.payment_id IS 'Links to the artist_payment record this API call relates to';
COMMENT ON COLUMN stripe_api_conversations.stripe_account_id IS 'The Stripe account ID used for the API call (CA vs US)';
COMMENT ON COLUMN stripe_api_conversations.processing_duration_ms IS 'Time taken for the API call in milliseconds';