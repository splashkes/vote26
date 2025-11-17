-- Import blocked SMS users from CSV
-- Date: November 2025
-- CSV has 16,520 blocked phone numbers to import

BEGIN;

-- Create temporary table for import
CREATE TEMP TABLE blocked_import (
  phone TEXT,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  blocked_date TEXT,
  last_promo_date TEXT
);

-- Import CSV data (will be done via \copy command)
-- \copy blocked_import FROM '/root/vote_app/vote-worker/blocked_sms_users.csv' CSV HEADER;

-- Check current state before update
SELECT
  'Before Import' as status,
  COUNT(*) as total_people,
  COUNT(CASE WHEN message_blocked > 0 THEN 1 END) as currently_blocked
FROM people;

-- Show sample of what we're importing
SELECT COUNT(*) as numbers_to_import FROM blocked_import;
SELECT phone, email, blocked_date FROM blocked_import LIMIT 5;

-- Update people table - check all three phone fields
WITH update_stats AS (
  UPDATE people p
  SET
    message_blocked = 1,
    updated_at = NOW()
  FROM blocked_import b
  WHERE
    (
      p.phone = b.phone OR
      p.phone_number = b.phone OR
      p.auth_phone = b.phone OR
      -- Also check without + prefix in case of formatting differences
      p.phone = REPLACE(b.phone, '+', '') OR
      p.phone_number = REPLACE(b.phone, '+', '') OR
      p.auth_phone = REPLACE(b.phone, '+', '') OR
      -- Check with + prefix added if not present
      ('+' || p.phone) = b.phone OR
      ('+' || p.phone_number) = b.phone OR
      ('+' || p.auth_phone) = b.phone
    )
    AND (p.message_blocked = 0 OR p.message_blocked IS NULL)
  RETURNING p.id
)
SELECT COUNT(*) as newly_blocked FROM update_stats;

-- Also add to opt-outs table for compliance tracking (excluding test record)
INSERT INTO sms_marketing_optouts (phone_number, source, opt_out_message, opted_out_at)
SELECT DISTINCT
  phone,
  'legacy_import_nov2025' as source,
  'Imported from blocked_sms_users.csv' as opt_out_message,
  COALESCE(blocked_date::timestamp, NOW()) as opted_out_at
FROM blocked_import
WHERE phone IS NOT NULL
  AND phone != ''
  AND phone != '+1234567890' -- Skip test number
ON CONFLICT (phone_number)
DO UPDATE SET
  opted_out_at = LEAST(
    sms_marketing_optouts.opted_out_at,
    EXCLUDED.opted_out_at
  ),
  source = CASE
    WHEN sms_marketing_optouts.source = 'test' THEN EXCLUDED.source
    ELSE sms_marketing_optouts.source
  END;

-- Check results after update
SELECT
  'After Import' as status,
  COUNT(*) as total_people,
  COUNT(CASE WHEN message_blocked > 0 THEN 1 END) as now_blocked,
  COUNT(CASE WHEN message_blocked > 0 THEN 1 END) - 12944 as increase
FROM people;

-- Show how many in opt-outs table
SELECT
  COUNT(*) as opt_out_records,
  COUNT(CASE WHEN source = 'legacy_import_nov2025' THEN 1 END) as from_this_import
FROM sms_marketing_optouts
WHERE is_active = true;

-- Find any numbers that weren't matched (for investigation)
SELECT COUNT(*) as unmatched_count
FROM blocked_import b
WHERE NOT EXISTS (
  SELECT 1 FROM people p
  WHERE p.phone = b.phone
    OR p.phone_number = b.phone
    OR p.auth_phone = b.phone
    OR p.phone = REPLACE(b.phone, '+', '')
    OR p.phone_number = REPLACE(b.phone, '+', '')
    OR p.auth_phone = REPLACE(b.phone, '+', '')
    OR ('+' || p.phone) = b.phone
    OR ('+' || p.phone_number) = b.phone
    OR ('+' || p.auth_phone) = b.phone
);

-- Show sample of unmatched numbers for debugging
SELECT b.phone, b.email, b.first_name, b.last_name
FROM blocked_import b
WHERE NOT EXISTS (
  SELECT 1 FROM people p
  WHERE p.phone = b.phone
    OR p.phone_number = b.phone
    OR p.auth_phone = b.phone
    OR p.phone = REPLACE(b.phone, '+', '')
    OR p.phone_number = REPLACE(b.phone, '+', '')
    OR p.auth_phone = REPLACE(b.phone, '+', '')
    OR ('+' || p.phone) = b.phone
    OR ('+' || p.phone_number) = b.phone
    OR ('+' || p.auth_phone) = b.phone
)
LIMIT 10;

COMMIT;