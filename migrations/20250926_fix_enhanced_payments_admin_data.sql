-- Fix get_enhanced_payments_admin_data to use proper ledger logic
-- Instead of hardcoded 0.5, it should use dynamic artist_auction_portion from events

DROP FUNCTION IF EXISTS get_enhanced_payments_admin_data();

CREATE OR REPLACE FUNCTION get_enhanced_payments_admin_data()
RETURNS TABLE (
  artists_owing JSONB,
  artists_zero_balance JSONB,
  recent_payments JSONB
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH art_sales AS (
    -- Use proper ledger logic with dynamic artist_auction_portion
    SELECT
      a.artist_id,
      e.currency,
      SUM(COALESCE(a.final_price, a.current_bid, 0) * e.artist_auction_portion) as total_earnings
    FROM art a
    JOIN events e ON a.event_id = e.id
    WHERE a.status IN ('sold', 'paid', 'closed')
      AND COALESCE(a.final_price, a.current_bid, 0) > 0
    GROUP BY a.artist_id, e.currency
  ),
  payment_debits AS (
    SELECT
      ap.artist_profile_id,
      ap.currency,
      SUM(ap.gross_amount) as total_paid
    FROM artist_payments ap
    WHERE ap.status IN ('completed', 'paid', 'verified')
    GROUP BY ap.artist_profile_id, ap.currency
  ),
  artist_balances AS (
    SELECT
      sales.artist_id,
      sales.currency,
      COALESCE(sales.total_earnings, 0) - COALESCE(debits.total_paid, 0) as balance
    FROM art_sales sales
    LEFT JOIN payment_debits debits ON sales.artist_id = debits.artist_profile_id
      AND sales.currency = debits.currency
  ),
  artists_with_balances AS (
    SELECT
      ap.id as artist_id,
      ap.name,
      ap.email,
      ap.entry_id,
      ap.phone,
      ap.country,
      ab.currency,
      ab.balance,
      agp.status as payment_status,
      agp.stripe_recipient_id,
      -- Recent contest count
      (SELECT COUNT(DISTINCT e3.id)
       FROM events e3
       JOIN rounds r3 ON r3.event_id = e3.id
       JOIN round_contestants rc3 ON rc3.round_id = r3.id
       WHERE rc3.artist_id = ap.id
         AND e3.event_start_datetime >= NOW() - INTERVAL '180 days') as recent_contests
    FROM artist_profiles ap
    JOIN artist_balances ab ON ap.id = ab.artist_id
    LEFT JOIN artist_global_payments agp ON ap.id = agp.artist_profile_id
    WHERE ab.balance > 0.01
  ),
  owing_artists AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'artist_profiles', jsonb_build_object(
          'id', artist_id,
          'name', name,
          'email', email,
          'entry_id', entry_id,
          'phone', phone,
          'country', country
        ),
        'estimated_balance', balance,
        'balance_currency', currency,
        'payment_status', payment_status,
        'stripe_recipient_id', stripe_recipient_id,
        'recent_contests', recent_contests
      )
    ) as owing_data
    FROM artists_with_balances
    WHERE balance > 0.01
  ),
  zero_balance_artists AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'artist_profiles', jsonb_build_object(
          'id', ap.id,
          'name', ap.name,
          'email', ap.email,
          'entry_id', ap.entry_id,
          'phone', ap.phone,
          'country', ap.country
        ),
        'estimated_balance', 0,
        'balance_currency', 'USD',
        'payment_status', agp.status,
        'stripe_recipient_id', agp.stripe_recipient_id,
        'recent_contests', (
          SELECT COUNT(DISTINCT e3.id)
          FROM events e3
          JOIN rounds r3 ON r3.event_id = e3.id
          JOIN round_contestants rc3 ON rc3.round_id = r3.id
          WHERE rc3.artist_id = ap.id
            AND e3.event_start_datetime >= NOW() - INTERVAL '180 days'
        )
      )
    ) as zero_data
    FROM artist_profiles ap
    LEFT JOIN artist_global_payments agp ON ap.id = agp.artist_profile_id
    WHERE NOT EXISTS (
      SELECT 1 FROM artists_with_balances awb WHERE awb.artist_id = ap.id
    )
    AND EXISTS (
      SELECT 1 FROM round_contestants rc
      JOIN rounds r ON rc.round_id = r.id
      JOIN events e ON r.event_id = e.id
      WHERE rc.artist_id = ap.id
        AND e.event_start_datetime >= NOW() - INTERVAL '180 days'
    )
  ),
  recent_payments_data AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'artist_name', ap.name,
        'amount', pay.gross_amount,
        'currency', pay.currency,
        'status', pay.status,
        'created_at', pay.created_at,
        'payment_type', pay.payment_type
      )
    ) as payments_data
    FROM artist_payments pay
    JOIN artist_profiles ap ON pay.artist_profile_id = ap.id
    WHERE pay.created_at >= NOW() - INTERVAL '30 days'
    ORDER BY pay.created_at DESC
    LIMIT 50
  )
  SELECT
    COALESCE(owing.owing_data, '[]'::jsonb),
    COALESCE(zero.zero_data, '[]'::jsonb),
    COALESCE(recent.payments_data, '[]'::jsonb)
  FROM owing_artists owing
  CROSS JOIN zero_balance_artists zero
  CROSS JOIN recent_payments_data recent;
END;
$$;

COMMENT ON FUNCTION get_enhanced_payments_admin_data() IS 'FIXED: Now uses proper ledger logic with dynamic artist_auction_portion instead of hardcoded calculations';

SELECT 'Enhanced payments admin data function fixed to use proper ledger logic' as status;