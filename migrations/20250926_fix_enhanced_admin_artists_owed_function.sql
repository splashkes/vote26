-- Fix get_enhanced_admin_artists_owed function to use dynamic artist_auction_portion
-- This function was showing $295 for artists owed list due to hardcoded 0.5 calculation

DROP FUNCTION IF EXISTS get_enhanced_admin_artists_owed();

CREATE OR REPLACE FUNCTION get_enhanced_admin_artists_owed()
RETURNS TABLE (
  artist_id UUID,
  artist_name TEXT,
  artist_email TEXT,
  artist_phone TEXT,
  artist_entry_id INTEGER,
  artist_country TEXT,
  estimated_balance NUMERIC,
  balance_currency TEXT,
  payment_account_status TEXT,
  stripe_recipient_id TEXT,
  recent_city TEXT,
  recent_contests INTEGER,
  invitation_count INTEGER,
  latest_invitation_method TEXT,
  latest_invitation_date TIMESTAMPTZ,
  time_since_latest TEXT,
  onboarding_status TEXT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH art_sales_by_currency AS (
    SELECT
      ap.id as artist_id,
      e.currency,
      -- FIXED: Changed hardcoded 0.5 to dynamic e.artist_auction_portion
      SUM(COALESCE(a.final_price, a.current_bid, 0) * e.artist_auction_portion) as sales_total
    FROM art a
    JOIN artist_profiles ap ON a.artist_id = ap.id
    JOIN events e ON a.event_id = e.id
    WHERE a.status = 'paid'  -- Only paid status counts as earned income
      AND COALESCE(a.final_price, a.current_bid, 0) > 0
    GROUP BY ap.id, e.currency
  ),
  automated_payment_debits_by_currency AS (
    -- Only automated payments (should match currency)
    SELECT
      ap.artist_profile_id,
      ap.currency,
      SUM(ap.gross_amount) as debits_total
    FROM artist_payments ap
    WHERE ap.payment_type = 'automated'
      AND ap.status IN ('completed', 'paid', 'verified')
    GROUP BY ap.artist_profile_id, ap.currency
  ),
  manual_payment_totals AS (
    -- Manual payments: treat as offsetting regardless of currency
    -- For cross-currency scenarios, assume equivalent value
    SELECT
      ap.artist_profile_id,
      SUM(ap.gross_amount) as manual_debits_total
    FROM artist_payments ap
    WHERE ap.payment_type = 'manual'
      AND ap.status IN ('completed', 'paid', 'verified')
    GROUP BY ap.artist_profile_id
  ),
  artist_currency_balances AS (
    SELECT
      ap.id as artist_id,
      sales.currency,
      COALESCE(sales.sales_total, 0) as sales_total,
      COALESCE(auto_debits.debits_total, 0) as automated_debits,
      -- Distribute manual payments proportionally across currencies
      CASE
        WHEN total_sales.total_sales > 0 THEN
          COALESCE(manual_debits.manual_debits_total, 0) *
          (COALESCE(sales.sales_total, 0) / total_sales.total_sales)
        ELSE COALESCE(manual_debits.manual_debits_total, 0)
      END as manual_debits_allocated,
      COALESCE(sales.sales_total, 0) -
      COALESCE(auto_debits.debits_total, 0) -
      CASE
        WHEN total_sales.total_sales > 0 THEN
          COALESCE(manual_debits.manual_debits_total, 0) *
          (COALESCE(sales.sales_total, 0) / total_sales.total_sales)
        ELSE COALESCE(manual_debits.manual_debits_total, 0)
      END as balance
    FROM artist_profiles ap
    LEFT JOIN art_sales_by_currency sales ON ap.id = sales.artist_id
    LEFT JOIN automated_payment_debits_by_currency auto_debits ON ap.id = auto_debits.artist_profile_id
      AND sales.currency = auto_debits.currency
    LEFT JOIN manual_payment_totals manual_debits ON ap.id = manual_debits.artist_profile_id
    LEFT JOIN (
      -- Total sales across all currencies for proportional allocation
      SELECT sales.artist_id, SUM(sales.sales_total) as total_sales
      FROM art_sales_by_currency sales
      GROUP BY sales.artist_id
    ) total_sales ON ap.id = total_sales.artist_id
    WHERE sales.artist_id IS NOT NULL  -- Only artists with sales
  ),
  primary_balances AS (
    SELECT
      acb.artist_id,
      acb.currency as balance_currency,
      acb.balance as estimated_balance,
      ROW_NUMBER() OVER (PARTITION BY acb.artist_id ORDER BY acb.balance DESC) as rn
    FROM artist_currency_balances acb
    WHERE acb.balance > 0.01
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
    LEFT JOIN cities c ON e.city_id = c.id
    WHERE e.event_start_datetime >= NOW() - INTERVAL '90 days'
    GROUP BY rc.artist_id, c.name
  ),
  latest_invitations AS (
    SELECT
      psi.artist_profile_id,
      COUNT(*) as invitation_count,
      MAX(psi.sent_at) as latest_invitation_date,
      (
        SELECT psi2.invitation_method
        FROM payment_setup_invitations psi2
        WHERE psi2.artist_profile_id = psi.artist_profile_id
        ORDER BY psi2.sent_at DESC
        LIMIT 1
      ) as latest_invitation_method,
      CASE
        WHEN MAX(psi.sent_at) > NOW() - INTERVAL '1 hour' THEN
          EXTRACT(EPOCH FROM (NOW() - MAX(psi.sent_at)))::int || 'm ago'
        WHEN MAX(psi.sent_at) > NOW() - INTERVAL '1 day' THEN
          EXTRACT(EPOCH FROM (NOW() - MAX(psi.sent_at)))::int / 3600 || 'h ago'
        ELSE
          EXTRACT(EPOCH FROM (NOW() - MAX(psi.sent_at)))::int / 86400 || 'd ago'
      END as time_since_latest
    FROM payment_setup_invitations psi
    WHERE psi.sent_at >= NOW() - INTERVAL '30 days'
    GROUP BY psi.artist_profile_id
  )
  SELECT
    ap.id::UUID,
    ap.name::TEXT,
    ap.email::TEXT,
    ap.phone::TEXT,
    ap.entry_id::INTEGER,
    ap.country::TEXT,
    pb.estimated_balance::NUMERIC,
    pb.balance_currency::TEXT,
    CASE
      WHEN agp.status = 'ready' AND agp.stripe_recipient_id IS NOT NULL THEN 'ready'
      WHEN agp.status IN ('pending_verification', 'restricted', 'blocked') THEN 'in_progress'
      WHEN li.invitation_count > 0 THEN 'invited'
      ELSE 'no_account'
    END::TEXT,
    agp.stripe_recipient_id::TEXT,
    COALESCE(rei.event_city, 'No recent events')::TEXT,
    COALESCE(rei.contest_count, 0)::INTEGER,
    COALESCE(li.invitation_count, 0)::INTEGER,
    li.latest_invitation_method::TEXT,
    li.latest_invitation_date::TIMESTAMPTZ,
    li.time_since_latest::TEXT,
    agp.status::TEXT
  FROM primary_balances pb
  JOIN artist_profiles ap ON pb.artist_id = ap.id
  LEFT JOIN recent_event_info rei ON ap.id = rei.artist_id AND rei.rn = 1
  LEFT JOIN latest_invitations li ON ap.id = li.artist_profile_id
  LEFT JOIN artist_global_payments agp ON ap.id = agp.artist_profile_id
  WHERE pb.rn = 1  -- Only primary balance per artist
  ORDER BY pb.estimated_balance DESC;
END;
$$;

COMMENT ON FUNCTION get_enhanced_admin_artists_owed() IS 'FIXED: Now uses dynamic artist_auction_portion from events table instead of hardcoded 50%';

-- Test the fix with Tetiana to verify it now shows correct amount
SELECT 'Testing get_enhanced_admin_artists_owed fix...' as status;
SELECT artist_name, artist_entry_id, estimated_balance
FROM get_enhanced_admin_artists_owed()
WHERE artist_entry_id = 164713;