-- Expand artist_payments table to support both automated and manual payments
-- Migration: 20250915000000_expand_artist_payments_for_manual_payments.sql

-- Add new columns for manual payments
ALTER TABLE artist_payments
ADD COLUMN payment_type VARCHAR(20) DEFAULT 'automated' NOT NULL,
ADD COLUMN payment_method VARCHAR(50),
ADD COLUMN description TEXT,
ADD COLUMN reference VARCHAR(100),
ADD COLUMN created_by VARCHAR(100),
ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();

-- Make art_id nullable to support manual payments not tied to specific art
ALTER TABLE artist_payments
ALTER COLUMN art_id DROP NOT NULL;

-- Add check constraint for payment_type
ALTER TABLE artist_payments
ADD CONSTRAINT artist_payments_payment_type_check
CHECK (payment_type IN ('automated', 'manual'));

-- Add check constraint for payment_method (only required for manual payments)
ALTER TABLE artist_payments
ADD CONSTRAINT artist_payments_payment_method_check
CHECK (
  (payment_type = 'automated') OR
  (payment_type = 'manual' AND payment_method IN ('bank_transfer', 'check', 'cash', 'paypal', 'other'))
);

-- Ensure manual payments have required fields
ALTER TABLE artist_payments
ADD CONSTRAINT artist_payments_manual_requirements_check
CHECK (
  (payment_type = 'automated') OR
  (payment_type = 'manual' AND description IS NOT NULL AND created_by IS NOT NULL)
);

-- Add indexes for new fields
CREATE INDEX idx_artist_payments_payment_type ON artist_payments(payment_type);
CREATE INDEX idx_artist_payments_payment_method ON artist_payments(payment_method);
CREATE INDEX idx_artist_payments_created_by ON artist_payments(created_by);
CREATE INDEX idx_artist_payments_updated_at ON artist_payments(updated_at DESC);

-- Create trigger to automatically update updated_at
CREATE OR REPLACE FUNCTION update_artist_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER artist_payments_updated_at_trigger
    BEFORE UPDATE ON artist_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_artist_payments_updated_at();

-- Comment the table to document the dual purpose
COMMENT ON TABLE artist_payments IS 'Stores both automated payments from art sales and manual payments created by administrators';
COMMENT ON COLUMN artist_payments.payment_type IS 'Type of payment: automated (from art sales) or manual (created by admin)';
COMMENT ON COLUMN artist_payments.payment_method IS 'Payment method for manual payments: bank_transfer, check, cash, paypal, other';
COMMENT ON COLUMN artist_payments.description IS 'Description of the payment (required for manual payments)';
COMMENT ON COLUMN artist_payments.reference IS 'Reference number or identifier for manual payments';
COMMENT ON COLUMN artist_payments.created_by IS 'Admin user who created manual payment (required for manual payments)';
COMMENT ON COLUMN artist_payments.art_id IS 'Reference to art piece (required for automated payments, optional for manual)';

-- Update existing records to have payment_type = 'automated'
UPDATE artist_payments SET payment_type = 'automated' WHERE payment_type IS NULL;