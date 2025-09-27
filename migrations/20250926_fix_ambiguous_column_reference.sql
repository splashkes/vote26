-- Fix ambiguous column reference in get_event_artists_owed function

DROP FUNCTION IF EXISTS get_event_artists_owed(UUID);

CREATE OR REPLACE FUNCTION get_event_artists_owed(p_event_id UUID)
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
  WITH event_art_sales AS (
    SELECT
      ap.id as sales_artist_id,
      e.currency,
      e.artist_auction_portion,
      SUM(COALESCE(a.final_price, a.current_bid, 0) * e.artist_auction_portion) as sales_total
    FROM art a
    JOIN artist_profiles ap ON a.artist_id = ap.id
    JOIN events e ON a.event_id = e.id
    WHERE a.event_id = p_event_id
      AND a.status = 'paid'
      AND COALESCE(a.final_price, a.current_bid, 0) > 0
    GROUP BY ap.id, e.currency, e.artist_auction_portion
  ),
  event_automated_payment_debits AS (
    SELECT
      ap.artist_profile_id,
      ap.currency,
      SUM(ap.gross_amount) as debits_total
    FROM artist_payments ap
    JOIN art a ON ap.art_id = a.id
    WHERE a.event_id = p_event_id
      AND ap.payment_type = 'automated'
      AND ap.status IN ('completed', 'paid', 'verified')
    GROUP BY ap.artist_profile_id, ap.currency
  ),
  event_manual_payment_totals AS (
    SELECT
      ap.artist_profile_id,
      SUM(ap.gross_amount) as manual_debits_total
    FROM artist_payments ap
    JOIN art a ON ap.art_id = a.id
    WHERE a.event_id = p_event_id
      AND ap.payment_type = 'manual'
      AND ap.status IN ('completed', 'paid', 'verified')
    GROUP BY ap.artist_profile_id
  ),
  event_artist_balances AS (
    SELECT
      ap.id as balance_artist_id,
      sales.currency,
      COALESCE(sales.sales_total, 0) as sales_total,
      COALESCE(auto_debits.debits_total, 0) as automated_debits,
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
    LEFT JOIN event_art_sales sales ON ap.id = sales.sales_artist_id
    LEFT JOIN event_automated_payment_debits auto_debits ON ap.id = auto_debits.artist_profile_id
      AND sales.currency = auto_debits.currency
    LEFT JOIN event_manual_payment_totals manual_debits ON ap.id = manual_debits.artist_profile_id
    LEFT JOIN (
      SELECT sales_artist_id, SUM(sales_total) as total_sales
      FROM event_art_sales
      GROUP BY sales_artist_id
    ) total_sales ON ap.id = total_sales.sales_artist_id
    WHERE sales.sales_artist_id IS NOT NULL
  ),
  event_primary_balances AS (
    SELECT
      balance_artist_id,
      currency as balance_currency,
      balance as estimated_balance,
      ROW_NUMBER() OVER (PARTITION BY balance_artist_id ORDER BY balance DESC) as rn
    FROM event_artist_balances
    WHERE balance > 0.01
  ),
  event_participants AS (
    SELECT DISTINCT
      rc.artist_id as participant_artist_id
    FROM round_contestants rc
    JOIN rounds r ON rc.round_id = r.id
    WHERE r.event_id = p_event_id
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
    e.name::TEXT,
    1::INTEGER,
    COALESCE(li.invitation_count, 0)::INTEGER,
    li.latest_invitation_method::TEXT,
    li.latest_invitation_date::TIMESTAMPTZ,
    li.time_since_latest::TEXT,
    agp.status::TEXT
  FROM event_primary_balances pb
  JOIN artist_profiles ap ON pb.balance_artist_id = ap.id
  JOIN event_participants ep ON ap.id = ep.participant_artist_id
  LEFT JOIN events e ON e.id = p_event_id
  LEFT JOIN latest_invitations li ON ap.id = li.artist_profile_id
  LEFT JOIN artist_global_payments agp ON ap.id = agp.artist_profile_id
  WHERE pb.rn = 1
  ORDER BY pb.estimated_balance DESC;
END;
$$;

SELECT 'Fixed column ambiguity in get_event_artists_owed function' as status;