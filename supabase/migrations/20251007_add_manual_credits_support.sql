-- Add support for manual credits (negative payments represent money owed to artist)
-- Migration: 20251007_add_manual_credits_support.sql

-- Add reason_category field to help categorize manual adjustments
ALTER TABLE artist_payments
ADD COLUMN reason_category VARCHAR(50);

-- Add check constraint for reason_category (only applies to manual payment_type)
ALTER TABLE artist_payments
ADD CONSTRAINT artist_payments_reason_category_check
CHECK (
  (payment_type = 'automated') OR
  (payment_type = 'manual' AND reason_category IN (
    'prize',
    'private_event',
    'supplies_reimbursement',
    'adjustment',
    'other'
  ))
);

-- Create index for reason_category
CREATE INDEX idx_artist_payments_reason_category ON artist_payments(reason_category);

-- Update existing manual payments to have 'other' category
UPDATE artist_payments
SET reason_category = 'other'
WHERE payment_type = 'manual' AND reason_category IS NULL;

-- Add comments
COMMENT ON COLUMN artist_payments.reason_category IS 'Category for manual payments: prize, private_event, supplies_reimbursement, adjustment, other';

-- Note: We allow negative amounts in gross_amount and net_amount fields
-- Negative amounts represent CREDITS (money owed TO artist)
-- Positive amounts represent DEBITS (money paid OUT to artist)
COMMENT ON COLUMN artist_payments.gross_amount IS 'Payment amount. Positive = debit (paid to artist), Negative = credit (owed to artist)';
COMMENT ON COLUMN artist_payments.net_amount IS 'Net payment amount after fees. Positive = debit (paid to artist), Negative = credit (owed to artist)';

-- Create helper view for manual adjustments
CREATE OR REPLACE VIEW artist_manual_adjustments AS
SELECT
  id,
  artist_profile_id,
  CASE
    WHEN gross_amount < 0 THEN 'credit'
    WHEN gross_amount > 0 THEN 'debit'
    ELSE 'zero'
  END as adjustment_type,
  ABS(gross_amount) as amount,
  currency,
  reason_category,
  payment_method,
  description,
  reference,
  created_by,
  status,
  created_at,
  updated_at
FROM artist_payments
WHERE payment_type = 'manual'
ORDER BY created_at DESC;

COMMENT ON VIEW artist_manual_adjustments IS 'View of manual adjustments showing credits (negative amounts) and debits (positive amounts) separately';

-- Grant access to the view
GRANT SELECT ON artist_manual_adjustments TO authenticated;
GRANT SELECT ON artist_manual_adjustments TO service_role;
