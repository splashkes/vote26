-- Enhanced Invitation Acceptance Schema Updates
-- Adds fields for comprehensive invitation acceptance form

-- Add pronouns field to artist_profiles
ALTER TABLE artist_profiles 
ADD COLUMN IF NOT EXISTS pronouns VARCHAR(100);

-- Add enhanced fields to artist_confirmations for comprehensive invitation acceptance
ALTER TABLE artist_confirmations 
ADD COLUMN IF NOT EXISTS legal_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS social_promotion_consent JSONB DEFAULT '{"twitter": false, "instagram": false, "facebook": false}'::jsonb,
ADD COLUMN IF NOT EXISTS social_usernames JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS message_to_organizers TEXT,
ADD COLUMN IF NOT EXISTS public_message TEXT,
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
ADD COLUMN IF NOT EXISTS payment_details JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS legal_agreements JSONB DEFAULT '{"photo_video_release": false, "painting_sales": false, "liability_waiver": false, "information_acknowledgment": false}'::jsonb,
ADD COLUMN IF NOT EXISTS promotion_artwork_url TEXT;

-- Add comments for documentation
COMMENT ON COLUMN artist_profiles.pronouns IS 'Artist pronouns preference (She/Her, He/Him, They/Them, Other, or custom)';
COMMENT ON COLUMN artist_confirmations.legal_name IS 'Artist legal name (may differ from public/stage name)';
COMMENT ON COLUMN artist_confirmations.social_promotion_consent IS 'Social media promotion permissions: {"twitter": bool, "instagram": bool, "facebook": bool}';
COMMENT ON COLUMN artist_confirmations.social_usernames IS 'Social media usernames: {"twitter": "username", "instagram": "username", "facebook": "pagename"}';
COMMENT ON COLUMN artist_confirmations.message_to_organizers IS 'Message to Art Battle and local partner';
COMMENT ON COLUMN artist_confirmations.public_message IS 'Short public message to audience';
COMMENT ON COLUMN artist_confirmations.payment_method IS 'Selected payment method (ZellePay, EMT, IBAN, UK_Sort_Code, PayPal, Bank_Transfer, Decide_Later)';
COMMENT ON COLUMN artist_confirmations.payment_details IS 'Payment method specific details (email, phone, IBAN, sort code, etc.)';
COMMENT ON COLUMN artist_confirmations.legal_agreements IS 'Legal agreement checkboxes: {"photo_video_release": bool, "painting_sales": bool, "liability_waiver": bool, "information_acknowledgment": bool}';
COMMENT ON COLUMN artist_confirmations.promotion_artwork_url IS 'URL to artwork shared for promotion purposes';