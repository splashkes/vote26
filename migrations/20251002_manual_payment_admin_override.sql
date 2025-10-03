-- Migration: Admin Override for Manual Payment Eligibility
-- Purpose: Allow admins to override 14-day requirement for manual payments
-- Date: 2025-10-02

-- Add override flag to artist_profiles
ALTER TABLE artist_profiles
ADD COLUMN IF NOT EXISTS manual_payment_override BOOLEAN DEFAULT FALSE;

-- Add timestamp for when override was set
ALTER TABLE artist_profiles
ADD COLUMN IF NOT EXISTS manual_payment_override_at TIMESTAMP WITH TIME ZONE;

-- Add admin who set the override
ALTER TABLE artist_profiles
ADD COLUMN IF NOT EXISTS manual_payment_override_by UUID REFERENCES people(id);

-- Create index for querying overrides
CREATE INDEX IF NOT EXISTS idx_artist_profiles_manual_payment_override
ON artist_profiles(manual_payment_override)
WHERE manual_payment_override = TRUE;

COMMENT ON COLUMN artist_profiles.manual_payment_override IS 'Admin override to enable manual payment regardless of 14-day requirement';
COMMENT ON COLUMN artist_profiles.manual_payment_override_at IS 'Timestamp when manual payment override was enabled';
COMMENT ON COLUMN artist_profiles.manual_payment_override_by IS 'Admin person_id who enabled the override';
