-- Fix artist_payment_overdue rule category
-- Date: 2025-10-08
-- Issue: Rule was categorized as data_completeness instead of artist_payments

UPDATE event_linter_rules
SET category = 'artist_payments',
    updated_at = now()
WHERE rule_id = 'artist_payment_overdue';

-- Verify the change
-- SELECT rule_id, name, category FROM event_linter_rules WHERE rule_id = 'artist_payment_overdue';
