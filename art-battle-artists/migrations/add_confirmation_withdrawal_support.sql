-- Add support for confirmation withdrawal
-- Date: August 25, 2025

-- Add withdrawal support to confirmation status
ALTER TABLE artist_confirmations 
ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS withdrawal_reason TEXT;

-- Update confirmation status check constraint to include 'withdrawn'
ALTER TABLE artist_confirmations 
DROP CONSTRAINT IF EXISTS artist_confirmations_confirmation_status_check;

ALTER TABLE artist_confirmations 
ADD CONSTRAINT artist_confirmations_confirmation_status_check 
CHECK (confirmation_status IN ('confirmed', 'withdrawn'));

-- Create index for withdrawn confirmations
CREATE INDEX IF NOT EXISTS idx_artist_confirmations_withdrawn_at 
ON artist_confirmations(withdrawn_at) 
WHERE withdrawn_at IS NOT NULL;