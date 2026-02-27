-- ============================================================================
-- DELETE ABANDONED STRIPE ACCOUNTS (DATABASE ONLY)
-- ============================================================================
-- This deletes ONLY from artist_global_payments table
-- NO CASCADE - Foreign key errors will be reported if they occur
-- Stripe API deletion must be done separately
-- ============================================================================

\echo ''
\echo '========================================='
\echo 'ACCOUNTS TO BE DELETED (7+ days old):'
\echo '========================================='
\echo ''

-- Show what will be deleted
\x
SELECT
  agp.id AS db_record_id,
  agp.stripe_recipient_id AS stripe_account_id,
  ap.name AS artist_name,
  ap.email AS artist_email,
  agp.status,
  agp.country,
  agp.created_at,
  EXTRACT(DAY FROM NOW() - agp.created_at)::integer AS days_old
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
\x

\echo ''
\echo '========================================='
\echo 'TOTAL COUNT:'
\echo '========================================='

SELECT COUNT(*) AS total_to_delete
FROM artist_global_payments agp
WHERE
  agp.status IN ('invited', 'blocked')
  AND agp.created_at < NOW() - INTERVAL '7 days'
  AND (
    agp.metadata->>'onboarding_completed' IS NULL
    OR (agp.metadata->>'onboarding_completed')::boolean = false
  );

\echo ''
\echo '========================================='
\echo 'EXECUTING DELETE...'
\echo '========================================='
\echo ''

-- DELETE with NO CASCADE
-- If foreign keys prevent deletion, an error will be shown
BEGIN;

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
\echo 'Delete executed. Check output above for errors.'
\echo ''
\prompt 'Type COMMIT to confirm deletion (or ROLLBACK to cancel): ' user_confirm

\echo ''
\echo '========================================='
\echo 'FINAL STATUS:'
\echo '========================================='
\echo ''
\echo 'NOTE: Stripe accounts must be deleted separately!'
\echo 'Use Stripe Dashboard or API to delete the stripe_account_id values shown above.'
\echo ''
