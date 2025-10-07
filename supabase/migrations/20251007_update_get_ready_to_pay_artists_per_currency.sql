-- Update get_ready_to_pay_artists to return ONE ROW PER CURRENCY
-- This prevents the multi-currency payment bug by making it explicit which currency each row represents

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
AS $function$
BEGIN
  RETURN QUERY
  -- Calculate earnings and payments PER CURRENCY, then return one row per artist per currency
  WITH art_sales_by_currency AS (
    SELECT
      ap.id as profile_id,
      e.currency as sale_currency,
      SUM(COALESCE(a.final_price, a.current_bid, 0) * e.artist_auction_portion) as sales_total
    FROM art a
    JOIN artist_profiles ap ON a.artist_id = ap.id
    JOIN events e ON a.event_id = e.id
    WHERE a.status IN ('sold', 'paid', 'closed')
      AND COALESCE(a.final_price, a.current_bid, 0) > 0
    GROUP BY ap.id, e.currency
  ),
  payment_debits_by_currency AS (
    SELECT
      artist_profile_id,
      currency,
      SUM(gross_amount) as debits_total
    FROM artist_payments
    WHERE status IN ('paid', 'verified', 'processing', 'pending')
      AND status != 'cancelled'
    GROUP BY artist_profile_id, currency
  ),
  artist_currency_count AS (
    SELECT
      profile_id,
      COUNT(DISTINCT sale_currency) > 1 as has_multiple_currencies
    FROM art_sales_by_currency
    GROUP BY profile_id
  ),
  recent_event_info AS (
    SELECT
      rc.artist_id as profile_id,
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
  active_payment_attempts_by_currency AS (
    SELECT DISTINCT artist_profile_id, currency
    FROM artist_payments
    WHERE status IN ('queued', 'processing', 'pending', 'initiated')
  ),
  manual_payment_requests AS (
    SELECT DISTINCT artist_profile_id
    FROM artist_manual_payment_requests
    WHERE status = 'pending'
  )

  -- STRIPE PAYMENTS: Artists with verified Stripe accounts - ONE ROW PER CURRENCY
  SELECT
    ap.id::UUID,
    ap.name::TEXT,
    ap.email::TEXT,
    ap.phone::TEXT,
    ap.entry_id::INTEGER,
    ap.country::TEXT,
    GREATEST(0, asbc.sales_total - COALESCE(pdbc.debits_total, 0))::NUMERIC as estimated_balance,
    asbc.sale_currency::TEXT as balance_currency,
    COALESCE(
      CASE asbc.sale_currency
        WHEN 'USD' THEN '$'
        WHEN 'CAD' THEN 'C$'
        WHEN 'EUR' THEN '€'
        WHEN 'GBP' THEN '£'
        WHEN 'AUD' THEN 'A$'
        WHEN 'THB' THEN '฿'
        ELSE '$'
      END,
      '$'
    )::TEXT as currency_symbol,
    COALESCE(acc.has_multiple_currencies, false)::BOOLEAN as has_mixed_currencies,
    agp.status::TEXT as payment_account_status,
    agp.stripe_recipient_id::TEXT,
    COALESCE(rei.event_city, 'No recent events')::TEXT as recent_city,
    COALESCE(rei.contest_count, 0)::BIGINT as recent_contests
  FROM art_sales_by_currency asbc
  JOIN artist_profiles ap ON asbc.profile_id = ap.id
  JOIN artist_global_payments agp ON ap.id = agp.artist_profile_id
  LEFT JOIN payment_debits_by_currency pdbc ON ap.id = pdbc.artist_profile_id AND asbc.sale_currency = pdbc.currency
  LEFT JOIN artist_currency_count acc ON ap.id = acc.profile_id
  LEFT JOIN recent_event_info rei ON ap.id = rei.profile_id AND rei.rn = 1
  LEFT JOIN active_payment_attempts_by_currency apac ON ap.id = apac.artist_profile_id AND asbc.sale_currency = apac.currency
  WHERE agp.status = 'ready'
    AND agp.stripe_recipient_id IS NOT NULL
    AND GREATEST(0, asbc.sales_total - COALESCE(pdbc.debits_total, 0)) > 0.01
    AND apac.artist_profile_id IS NULL  -- No active payment in this currency

  UNION ALL

  -- MANUAL PAYMENTS: ANY artist who has submitted manual payment request info - ONE ROW PER CURRENCY
  SELECT
    ap.id::UUID,
    ap.name::TEXT,
    ap.email::TEXT,
    ap.phone::TEXT,
    ap.entry_id::INTEGER,
    ap.country::TEXT,
    GREATEST(0, asbc.sales_total - COALESCE(pdbc.debits_total, 0))::NUMERIC as estimated_balance,
    asbc.sale_currency::TEXT as balance_currency,
    COALESCE(
      CASE asbc.sale_currency
        WHEN 'USD' THEN '$'
        WHEN 'CAD' THEN 'C$'
        WHEN 'EUR' THEN '€'
        WHEN 'GBP' THEN '£'
        WHEN 'AUD' THEN 'A$'
        WHEN 'THB' THEN '฿'
        ELSE '$'
      END,
      '$'
    )::TEXT as currency_symbol,
    COALESCE(acc.has_multiple_currencies, false)::BOOLEAN as has_mixed_currencies,
    'READY MANUAL'::TEXT as payment_account_status,
    NULL::TEXT as stripe_recipient_id,
    COALESCE(rei.event_city, 'No recent events')::TEXT as recent_city,
    COALESCE(rei.contest_count, 0)::BIGINT as recent_contests
  FROM art_sales_by_currency asbc
  JOIN artist_profiles ap ON asbc.profile_id = ap.id
  JOIN manual_payment_requests mpr ON ap.id = mpr.artist_profile_id  -- Include ANY artist with manual payment request
  LEFT JOIN payment_debits_by_currency pdbc ON ap.id = pdbc.artist_profile_id AND asbc.sale_currency = pdbc.currency
  LEFT JOIN artist_currency_count acc ON ap.id = acc.profile_id
  LEFT JOIN recent_event_info rei ON ap.id = rei.profile_id AND rei.rn = 1
  LEFT JOIN active_payment_attempts_by_currency apac ON ap.id = apac.artist_profile_id AND asbc.sale_currency = apac.currency
  WHERE GREATEST(0, asbc.sales_total - COALESCE(pdbc.debits_total, 0)) > 0.01  -- Has balance owed
    AND apac.artist_profile_id IS NULL  -- No active payment in this currency
    AND NOT EXISTS (  -- Artist doesn't have a Stripe account ready
      SELECT 1 FROM artist_global_payments agp
      WHERE agp.artist_profile_id = ap.id
      AND agp.status = 'ready'
      AND agp.stripe_recipient_id IS NOT NULL
    )

  ORDER BY 2, 8;  -- Order by artist_name (column 2), balance_currency (column 8)

END;
$function$;

COMMENT ON FUNCTION get_ready_to_pay_artists() IS
'Returns artists ready for payment with ONE ROW PER CURRENCY. If an artist has USD and CAD balances, they will appear twice - once for each currency. This prevents multi-currency payment bugs.';
