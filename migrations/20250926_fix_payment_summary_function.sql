-- Fix get_event_payment_summary function with correct syntax

CREATE OR REPLACE FUNCTION get_event_payment_summary(p_event_id UUID)
RETURNS TABLE (
  event_name TEXT,
  event_currency TEXT,
  artist_auction_portion NUMERIC,
  total_artists_owing INTEGER,
  total_amount_owing NUMERIC,
  artists_ready_to_pay INTEGER,
  artists_no_account INTEGER,
  unpaid_art_pieces INTEGER,
  recent_payment_count INTEGER,
  event_currency_totals JSONB
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH event_info AS (
    SELECT e.name, e.currency, e.artist_auction_portion
    FROM events e
    WHERE e.id = p_event_id
  ),
  art_sales AS (
    SELECT
      a.artist_id,
      e.currency,
      e.artist_auction_portion,
      SUM(COALESCE(a.final_price, a.current_bid, 0) * e.artist_auction_portion) as gross_earnings -- Dynamic calculation
    FROM art a
    JOIN events e ON a.event_id = e.id
    WHERE a.event_id = p_event_id
      AND a.status = 'paid'
      AND COALESCE(a.final_price, a.current_bid, 0) > 0
    GROUP BY a.artist_id, e.currency, e.artist_auction_portion
  ),
  payment_debits AS (
    SELECT
      ap.artist_profile_id,
      e.currency,
      SUM(ap.gross_amount) as total_debits
    FROM artist_payments ap
    JOIN art a ON ap.art_id = a.id
    JOIN events e ON a.event_id = e.id
    WHERE e.id = p_event_id
      AND ap.status IN ('completed', 'paid', 'verified')
    GROUP BY ap.artist_profile_id, e.currency
  ),
  artist_balances AS (
    SELECT
      ars.artist_id,
      ars.currency,
      ars.gross_earnings,
      COALESCE(pd.total_debits, 0) as total_debits,
      (ars.gross_earnings - COALESCE(pd.total_debits, 0)) as net_balance
    FROM art_sales ars
    LEFT JOIN payment_debits pd ON ars.artist_id = pd.artist_profile_id AND ars.currency = pd.currency
    WHERE (ars.gross_earnings - COALESCE(pd.total_debits, 0)) > 0.01
  ),
  currency_breakdown AS (
    SELECT
      ab.currency,
      COUNT(DISTINCT ab.artist_id) as artist_count,
      SUM(ab.net_balance) as total_owed
    FROM artist_balances ab
    GROUP BY ab.currency
  ),
  account_status_counts AS (
    SELECT
      COUNT(CASE WHEN agp.status = 'ready' AND agp.stripe_recipient_id IS NOT NULL THEN 1 END) as ready_count,
      COUNT(CASE WHEN agp.status IS NULL OR agp.stripe_recipient_id IS NULL THEN 1 END) as no_account_count
    FROM artist_balances ab
    LEFT JOIN artist_global_payments agp ON ab.artist_id = agp.artist_profile_id
  ),
  unpaid_art AS (
    SELECT COUNT(*) as unpaid_count
    FROM art a
    WHERE a.event_id = p_event_id
      AND a.status = 'sold'
      AND COALESCE(a.final_price, a.current_bid, 0) > 0
  )
  SELECT
    ei.name::TEXT,
    ei.currency::TEXT,
    ei.artist_auction_portion::NUMERIC,
    COALESCE((SELECT COUNT(DISTINCT artist_id) FROM artist_balances), 0)::INTEGER,
    COALESCE((SELECT SUM(net_balance) FROM artist_balances), 0)::NUMERIC,
    COALESCE(status_counts.ready_count, 0)::INTEGER,
    COALESCE(status_counts.no_account_count, 0)::INTEGER,
    COALESCE(ua.unpaid_count, 0)::INTEGER,
    0::INTEGER as recent_payment_count,
    COALESCE(
      jsonb_object_agg(
        cb.currency,
        jsonb_build_object(
          'count', cb.artist_count,
          'total', cb.total_owed
        )
      ),
      '{}'::jsonb
    ) as event_currency_totals
  FROM event_info ei
  CROSS JOIN account_status_counts status_counts
  CROSS JOIN unpaid_art ua
  LEFT JOIN currency_breakdown cb ON true
  GROUP BY ei.name, ei.currency, ei.artist_auction_portion, status_counts.ready_count, status_counts.no_account_count, ua.unpaid_count;
END;
$$;

COMMENT ON FUNCTION get_event_payment_summary(UUID) IS 'Updated to use dynamic artist_auction_portion from events table instead of hardcoded 50%';

SELECT 'get_event_payment_summary function fixed' as status;