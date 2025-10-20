-- Fix get_ready_to_pay_artists to ONLY count 'paid' art, not 'sold'
-- ISSUE: Julio test Facebook window (entry_id: 310276) showing $87.50 balance but ledger shows $0
-- ROOT CAUSE: 'sold' status means auction won but artist NOT YET PAID
--             Ledger sets amount=0 for 'sold' status (line 188: ledgerAmount = art.status === 'paid' ? artistCommission : 0)
--             But ready_to_pay was counting 'sold' as credits

-- Previous fix removed 'closed' but still included 'sold'
-- This fix changes to ONLY 'paid' to match ledger

CREATE OR REPLACE FUNCTION get_ready_to_pay_artists()
RETURNS TABLE(
  artist_id UUID,
  artist_name TEXT,
  artist_email TEXT,
  artist_phone TEXT,
  artist_entry_id INTEGER,
  artist_country TEXT,
  estimated_balance NUMERIC,
  balance_currency TEXT,
  currency_symbol TEXT,
  has_mixed_currencies BOOLEAN,
  payment_account_status TEXT,
  stripe_recipient_id TEXT,
  recent_city TEXT,
  recent_contests BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  -- Shared CTEs used by both queries
  WITH art_sales_by_currency AS (
    SELECT
      ap.id as artist_id,
      e.currency as sale_currency,
      SUM(COALESCE(a.final_price, a.current_bid, 0) * e.artist_auction_portion) as sales_total
    FROM art a
    JOIN artist_profiles ap ON a.artist_id = ap.id
    JOIN events e ON a.event_id = e.id
    -- FIXED: Only count 'paid' to match ledger (ledgerAmount = status === 'paid' ? commission : 0)
    -- Previous: WHERE a.status IN ('sold', 'paid', 'closed') -- counted unsold and unpaid art
    -- Fix 1:    WHERE a.status IN ('sold', 'paid') -- still counted unpaid art
    -- Fix 2:    WHERE a.status = 'paid' -- correct!
    WHERE a.status = 'paid'
      AND COALESCE(a.final_price, a.current_bid, 0) > 0
    GROUP BY ap.id, e.currency
  ),
  artist_currency_summary AS (
    SELECT
      art_sales_by_currency.artist_id,
      (ARRAY_AGG(sale_currency ORDER BY sales_total DESC))[1] as primary_currency,
      MAX(sales_total) as primary_balance,
      COUNT(DISTINCT sale_currency) > 1 as has_mixed_currencies,
      SUM(sales_total) as total_all_currencies
    FROM art_sales_by_currency
    GROUP BY art_sales_by_currency.artist_id
  ),
  payment_debits AS (
    SELECT
      ap.artist_profile_id,
      SUM(ap.gross_amount) as debits_total
    FROM artist_payments ap
    WHERE ap.status != 'cancelled'
    GROUP BY ap.artist_profile_id
  ),
  recent_event_info AS (
    SELECT
      rc.artist_id,
      c.name as event_city,
      COUNT(DISTINCT e.id) as contest_count,
      ROW_NUMBER() OVER (PARTITION BY rc.artist_id ORDER BY MAX(e.event_start_datetime) DESC) as rn
    FROM round_contestants rc
    JOIN rounds r ON rc.round_id = r.id
    JOIN events e ON r.event_id = e.id
    JOIN cities c ON e.city_id = c.id
    WHERE e.event_start_datetime >= NOW() - INTERVAL '365 days'
    GROUP BY rc.artist_id, c.name
  ),
  active_payment_attempts AS (
    SELECT DISTINCT artist_profile_id
    FROM artist_payments
    WHERE status IN ('queued', 'processing', 'pending', 'initiated')
  )

  -- STRIPE PAYMENTS: Artists with verified Stripe accounts
  SELECT
    ap.id::UUID,
    ap.name::TEXT,
    ap.email::TEXT,
    ap.phone::TEXT,
    ap.entry_id::INTEGER,
    ap.country::TEXT,
    GREATEST(0, COALESCE(acs.total_all_currencies, 0) - COALESCE(pd.debits_total, 0))::NUMERIC,
    COALESCE(acs.primary_currency, 'USD')::TEXT,
    COALESCE(
      CASE acs.primary_currency
        WHEN 'USD' THEN '$'
        WHEN 'CAD' THEN 'C$'
        WHEN 'EUR' THEN '€'
        WHEN 'GBP' THEN '£'
        WHEN 'AUD' THEN 'A$'
        ELSE '$'
      END,
      '$'
    )::TEXT,
    COALESCE(acs.has_mixed_currencies, false)::BOOLEAN,
    agp.status::TEXT,
    agp.stripe_recipient_id::TEXT,
    COALESCE(rei.event_city, 'No recent events')::TEXT,
    COALESCE(rei.contest_count, 0)::BIGINT
  FROM artist_profiles ap
  JOIN artist_global_payments agp ON ap.id = agp.artist_profile_id
  LEFT JOIN artist_currency_summary acs ON ap.id = acs.artist_id
  LEFT JOIN payment_debits pd ON ap.id = pd.artist_profile_id
  LEFT JOIN recent_event_info rei ON ap.id = rei.artist_id AND rei.rn = 1
  LEFT JOIN active_payment_attempts apa ON ap.id = apa.artist_profile_id
  WHERE agp.status = 'ready'
    AND agp.stripe_recipient_id IS NOT NULL
    AND GREATEST(0, COALESCE(acs.total_all_currencies, 0) - COALESCE(pd.debits_total, 0)) > 0.01
    AND apa.artist_profile_id IS NULL

  UNION ALL

  -- MANUAL PAYMENTS: Artists with pending manual payment requests and balance owing
  SELECT
    ap.id::UUID,
    ap.name::TEXT,
    ap.email::TEXT,
    ap.phone::TEXT,
    ap.entry_id::INTEGER,
    ap.country::TEXT,
    GREATEST(0, COALESCE(acs.total_all_currencies, 0) - COALESCE(pd.debits_total, 0))::NUMERIC,
    COALESCE(acs.primary_currency, 'USD')::TEXT,
    COALESCE(
      CASE acs.primary_currency
        WHEN 'USD' THEN '$'
        WHEN 'CAD' THEN 'C$'
        WHEN 'EUR' THEN '€'
        WHEN 'GBP' THEN '£'
        WHEN 'AUD' THEN 'A$'
        ELSE '$'
      END,
      '$'
    )::TEXT,
    COALESCE(acs.has_mixed_currencies, false)::BOOLEAN,
    'READY MANUAL'::TEXT,  -- Special status for manual payments
    NULL::TEXT,  -- No Stripe ID for manual payments
    COALESCE(rei.event_city, 'No recent events')::TEXT,
    COALESCE(rei.contest_count, 0)::BIGINT
  FROM artist_profiles ap
  JOIN artist_manual_payment_requests ampr ON ap.id = ampr.artist_profile_id
  LEFT JOIN artist_currency_summary acs ON ap.id = acs.artist_id
  LEFT JOIN payment_debits pd ON ap.id = pd.artist_profile_id
  LEFT JOIN recent_event_info rei ON ap.id = rei.artist_id AND rei.rn = 1
  WHERE ampr.status = 'pending'
    AND GREATEST(0, COALESCE(acs.total_all_currencies, 0) - COALESCE(pd.debits_total, 0)) > 0.01
    -- Only include if they don't already have a Stripe payment ready (avoid duplicates)
    AND NOT EXISTS (
      SELECT 1
      FROM artist_global_payments agp
      WHERE agp.artist_profile_id = ap.id
        AND agp.status = 'ready'
        AND agp.stripe_recipient_id IS NOT NULL
    )

  ORDER BY 7 DESC;  -- Order by estimated_balance (column 7)
END;
$$;

COMMENT ON FUNCTION get_ready_to_pay_artists IS 'Returns artists ready to be paid. Credits ONLY count paid art (status=paid), matching ledger calculation.';

-- Log migration completion
INSERT INTO system_logs (service, operation, level, message, request_data)
VALUES (
    'migration',
    'fix_ready_to_pay_only_paid_art',
    'info',
    'Updated get_ready_to_pay_artists to only count paid art, not sold art',
    jsonb_build_object(
        'migration_file', '20251019_fix_ready_to_pay_only_paid_art.sql',
        'applied_at', NOW()::text,
        'issue', 'Artists showing in ready to pay with balances for sold but unpaid art',
        'example_artist', 'Julio test Facebook window (entry_id: 310276)',
        'example_data', jsonb_build_object(
            'artist_id', 'ac423538-f2bc-4cfe-9d8a-25b5510ad405',
            'art_paid', '$145 (AB6093-1-1, AB6093-2-1)',
            'art_sold_not_paid', '$87.50 (AB6099-1-1)',
            'payment', '$145',
            'ledger_balance', '$0 (only counts paid art)',
            'old_ready_to_pay_balance', '$87.50 (WRONG - counted sold art)',
            'new_ready_to_pay_balance', '$0 (CORRECT - only paid art)'
        ),
        'ledger_logic', 'ledgerAmount = art.status === paid ? artistCommission : 0 (line 188)',
        'art_status_meanings', jsonb_build_object(
            'paid', 'Artist has been paid - COUNTS as credit',
            'sold', 'Auction won but artist NOT YET PAID - amount = 0',
            'closed', 'No sale - amount = 0'
        )
    )
);
