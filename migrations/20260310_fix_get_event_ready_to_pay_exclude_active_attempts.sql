CREATE OR REPLACE FUNCTION public.get_event_ready_to_pay(p_event_id UUID)
RETURNS TABLE (
  artist_id UUID,
  artist_name TEXT,
  artist_email TEXT,
  artist_phone TEXT,
  artist_entry_id INTEGER,
  artist_country TEXT,
  estimated_balance NUMERIC,
  balance_currency TEXT,
  stripe_recipient_id TEXT,
  recent_city TEXT,
  recent_contests INTEGER,
  default_currency TEXT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH art_sales AS (
    SELECT
      a.artist_id,
      e.currency,
      e.artist_auction_portion,
      SUM(COALESCE(a.final_price, a.current_bid, 0) * e.artist_auction_portion) AS gross_earnings
    FROM art a
    JOIN events e ON a.event_id = e.id
    WHERE a.event_id = p_event_id
      AND a.status = 'paid'
      AND COALESCE(a.final_price, a.current_bid, 0) > 0
    GROUP BY a.artist_id, e.currency, e.artist_auction_portion
  ),
  payment_totals AS (
    SELECT
      ap.artist_profile_id,
      ap.currency,
      SUM(ap.gross_amount) AS debits_total
    FROM artist_payments ap
    JOIN art a ON ap.art_id = a.id
    WHERE a.event_id = p_event_id
      AND ap.status IN ('completed', 'paid', 'verified')
    GROUP BY ap.artist_profile_id, ap.currency
  ),
  active_payment_attempts AS (
    SELECT DISTINCT
      ap.artist_profile_id,
      ap.currency
    FROM artist_payments ap
    JOIN art a ON ap.art_id = a.id
    WHERE a.event_id = p_event_id
      AND ap.status IN ('queued', 'processing', 'pending', 'initiated')
  ),
  artist_balances AS (
    SELECT
      ars.artist_id,
      ars.currency,
      ars.gross_earnings,
      COALESCE(pt.debits_total, 0) AS debits_total,
      (ars.gross_earnings - COALESCE(pt.debits_total, 0)) AS net_balance
    FROM art_sales ars
    LEFT JOIN payment_totals pt
      ON ars.artist_id = pt.artist_profile_id
     AND ars.currency = pt.currency
    WHERE (ars.gross_earnings - COALESCE(pt.debits_total, 0)) > 0.01
  )
  SELECT
    ab.artist_id::UUID,
    prof.name::TEXT,
    prof.email::TEXT,
    prof.phone::TEXT,
    prof.entry_id::INTEGER,
    prof.country::TEXT,
    ab.net_balance::NUMERIC,
    ab.currency::TEXT,
    agp.stripe_recipient_id::TEXT,
    ''::TEXT AS recent_city,
    0::INTEGER AS recent_contests,
    agp.default_currency::TEXT
  FROM artist_balances ab
  JOIN artist_profiles prof ON ab.artist_id = prof.id
  JOIN artist_global_payments agp ON prof.id = agp.artist_profile_id
  LEFT JOIN active_payment_attempts apa
    ON ab.artist_id = apa.artist_profile_id
   AND ab.currency = apa.currency
  WHERE agp.status = 'ready'
    AND agp.stripe_recipient_id IS NOT NULL
    AND apa.artist_profile_id IS NULL
  ORDER BY ab.net_balance DESC;
END;
$$;
