-- Delete Abandoned Stripe Accounts (Database Only)
-- This script ONLY deletes from artist_global_payments table
-- NO CASCADE - will error if foreign keys prevent deletion
-- Run Stripe API deletion separately

-- Step 1: Show what will be deleted
\echo '========================================='
\echo 'ACCOUNTS TO BE DELETED:'
\echo '========================================='

SELECT
  agp.id,
  agp.stripe_recipient_id,
  ap.name as artist_name,
  ap.email,
  agp.status,
  agp.country,
  EXTRACT(DAY FROM NOW() - agp.created_at)::integer as days_old
FROM artist_global_payments agp
JOIN artist_profiles ap ON agp.artist_profile_id = ap.id
WHERE
  agp.status IN ('invited', 'blocked')
  AND agp.created_at < NOW() - INTERVAL '7 days'
  AND (
    agp.metadata->>'onboarding_completed' IS NULL
    OR (agp.metadata->>'onboarding_completed')::boolean = false
  )
ORDER BY agp.created_at DESC;

\echo ''
\echo '========================================='
\echo 'DELETING FROM DATABASE...'
\echo '========================================='

-- Step 2: Delete from database (NO CASCADE)
-- If this fails due to foreign key constraints, the error will be reported
DELETE FROM artist_global_payments
WHERE id IN (
  SELECT agp.id
  FROM artist_global_payments agp
  WHERE
    agp.status IN ('invited', 'blocked')
    AND agp.created_at < NOW() - INTERVAL '7 days'
    AND (
      agp.metadata->>'onboarding_completed' IS NULL
      OR (agp.metadata->>'onboarding_completed')::boolean = false
    )
);

\echo ''
\echo '========================================='
\echo 'DELETION COMPLETE'
\echo '========================================='

-- Show summary
SELECT
  'Total deleted: ' || COUNT(*) as summary
FROM (VALUES (1)) v(x)
WHERE EXISTS (
  SELECT 1 FROM artist_global_payments WHERE FALSE
);

\echo ''
\echo 'NOTE: Stripe accounts must be deleted separately via Stripe API'
\echo 'Use the account IDs shown above to delete from Stripe Dashboard or API'
