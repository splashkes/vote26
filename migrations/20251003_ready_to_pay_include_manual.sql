-- Update get_ready_to_pay_artists to include artists with pending manual payment requests
-- They show as "READY MANUAL" status

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
    WHERE a.status IN ('sold', 'paid', 'closed')
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
    WHERE ap.status IN ('paid', 'verified')
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

COMMENT ON FUNCTION get_ready_to_pay_artists IS 'Returns artists ready to be paid via Stripe OR manual payment request. Manual payments show as "READY MANUAL" status.';
