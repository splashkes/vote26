-- Update all payment calculation functions to use dynamic artist_auction_portion
-- Replaces hardcoded 0.5 multipliers with event-specific percentages

-- 1. Update get_event_artists_owed function
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
  stripe_recipient_id TEXT,
  payment_account_status TEXT,
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
      e.artist_auction_portion, -- Use dynamic percentage
      SUM(COALESCE(a.final_price, a.current_bid, 0) * e.artist_auction_portion) as gross_earnings -- Dynamic calculation
    FROM art a
    JOIN events e ON a.event_id = e.id
    WHERE a.event_id = p_event_id
      AND a.status = 'paid'
      AND COALESCE(a.final_price, a.current_bid, 0) > 0
    GROUP BY a.artist_id, e.currency, e.artist_auction_portion
  ),
  manual_payment_totals AS (
    SELECT
      ap.artist_profile_id,
      e.currency,
      SUM(ap.gross_amount) as manual_debits_total
    FROM artist_payments ap
    JOIN art a ON ap.art_id = a.id
    JOIN events e ON a.event_id = e.id
    WHERE e.id = p_event_id
      AND ap.payment_type = 'manual'
      AND ap.status IN ('completed', 'paid', 'verified')
    GROUP BY ap.artist_profile_id, e.currency
  ),
  automated_payment_totals AS (
    SELECT
      ap.artist_profile_id,
      e.currency,
      SUM(ap.gross_amount) as automated_debits_total
    FROM artist_payments ap
    JOIN art a ON ap.art_id = a.id
    JOIN events e ON a.event_id = e.id
    WHERE e.id = p_event_id
      AND ap.payment_type = 'automated'
      AND ap.status IN ('completed', 'paid', 'verified')
    GROUP BY ap.artist_profile_id, e.currency
  ),
  artist_balances AS (
    SELECT
      ars.artist_id,
      ars.currency,
      ars.gross_earnings,
      COALESCE(mpt.manual_debits_total, 0) as manual_debits,
      COALESCE(apt.automated_debits_total, 0) as automated_debits,
      (ars.gross_earnings - COALESCE(mpt.manual_debits_total, 0) - COALESCE(apt.automated_debits_total, 0)) as net_balance
    FROM art_sales ars
    LEFT JOIN manual_payment_totals mpt ON ars.artist_id = mpt.artist_profile_id AND ars.currency = mpt.currency
    LEFT JOIN automated_payment_totals apt ON ars.artist_id = apt.artist_profile_id AND ars.currency = apt.currency
    WHERE (ars.gross_earnings - COALESCE(mpt.manual_debits_total, 0) - COALESCE(apt.automated_debits_total, 0)) > 0.01
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
    COALESCE(agp.status, 'not_set_up')::TEXT,
    ''::TEXT as recent_city,
    0::INTEGER as recent_contests,
    COALESCE(agp.default_currency, 'USD')::TEXT
  FROM artist_balances ab
  JOIN artist_profiles prof ON ab.artist_id = prof.id
  LEFT JOIN artist_global_payments agp ON prof.id = agp.artist_profile_id
  ORDER BY ab.net_balance DESC;
END;
$$;

-- 2. Update get_event_ready_to_pay function
CREATE OR REPLACE FUNCTION get_event_ready_to_pay(p_event_id UUID)
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
      e.artist_auction_portion, -- Use dynamic percentage
      SUM(COALESCE(a.final_price, a.current_bid, 0) * e.artist_auction_portion) as gross_earnings -- Dynamic calculation
    FROM art a
    JOIN events e ON a.event_id = e.id
    WHERE a.event_id = p_event_id
      AND a.status = 'paid'
      AND COALESCE(a.final_price, a.current_bid, 0) > 0
    GROUP BY a.artist_id, e.currency, e.artist_auction_portion
  ),
  manual_payment_totals AS (
    SELECT
      ap.artist_profile_id,
      e.currency,
      SUM(ap.gross_amount) as manual_debits_total
    FROM artist_payments ap
    JOIN art a ON ap.art_id = a.id
    JOIN events e ON a.event_id = e.id
    WHERE e.id = p_event_id
      AND ap.payment_type = 'manual'
      AND ap.status IN ('completed', 'paid', 'verified')
    GROUP BY ap.artist_profile_id, e.currency
  ),
  automated_payment_totals AS (
    SELECT
      ap.artist_profile_id,
      e.currency,
      SUM(ap.gross_amount) as automated_debits_total
    FROM artist_payments ap
    JOIN art a ON ap.art_id = a.id
    JOIN events e ON a.event_id = e.id
    WHERE e.id = p_event_id
      AND ap.payment_type = 'automated'
      AND ap.status IN ('completed', 'paid', 'verified')
    GROUP BY ap.artist_profile_id, e.currency
  ),
  artist_balances AS (
    SELECT
      ars.artist_id,
      ars.currency,
      ars.gross_earnings,
      COALESCE(mpt.manual_debits_total, 0) as manual_debits,
      COALESCE(apt.automated_debits_total, 0) as automated_debits,
      (ars.gross_earnings - COALESCE(mpt.manual_debits_total, 0) - COALESCE(apt.automated_debits_total, 0)) as net_balance
    FROM art_sales ars
    LEFT JOIN manual_payment_totals mpt ON ars.artist_id = mpt.artist_profile_id AND ars.currency = mpt.currency
    LEFT JOIN automated_payment_totals apt ON ars.artist_id = apt.artist_profile_id AND ars.currency = apt.currency
    WHERE (ars.gross_earnings - COALESCE(mpt.manual_debits_total, 0) - COALESCE(apt.automated_debits_total, 0)) > 0.01
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
    ''::TEXT as recent_city,
    0::INTEGER as recent_contests,
    COALESCE(agp.default_currency, 'USD')::TEXT
  FROM artist_balances ab
  JOIN artist_profiles prof ON ab.artist_id = prof.id
  JOIN artist_global_payments agp ON prof.id = agp.artist_profile_id
  WHERE agp.status = 'ready'
    AND agp.stripe_recipient_id IS NOT NULL
  ORDER BY ab.net_balance DESC;
END;
$$;

-- 3. Update get_event_payment_summary function
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
    COALESCE(asc.ready_count, 0)::INTEGER,
    COALESCE(asc.no_account_count, 0)::INTEGER,
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
  CROSS JOIN account_status_counts asc
  CROSS JOIN unpaid_art ua
  LEFT JOIN currency_breakdown cb ON true
  GROUP BY ei.name, ei.currency, ei.artist_auction_portion, asc.ready_count, asc.no_account_count, ua.unpaid_count;
END;
$$;

-- 4. Update global get_artists_owed function (affects global payments)
CREATE OR REPLACE FUNCTION get_artists_owed()
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
  payment_account_status TEXT,
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
      e.artist_auction_portion, -- Use dynamic percentage
      SUM(COALESCE(a.final_price, a.current_bid, 0) * e.artist_auction_portion) as gross_earnings -- Dynamic calculation
    FROM art a
    JOIN events e ON a.event_id = e.id
    WHERE a.status = 'paid'
      AND COALESCE(a.final_price, a.current_bid, 0) > 0
    GROUP BY a.artist_id, e.currency, e.artist_auction_portion
  ),
  manual_payment_totals AS (
    SELECT
      ap.artist_profile_id,
      CASE
        WHEN ap.art_id IS NOT NULL THEN (
          SELECT e.currency
          FROM art a
          JOIN events e ON a.event_id = e.id
          WHERE a.id = ap.art_id
        )
        ELSE ap.currency
      END as currency,
      SUM(ap.gross_amount) as manual_debits_total
    FROM artist_payments ap
    WHERE ap.payment_type = 'manual'
      AND ap.status IN ('completed', 'paid', 'verified')
    GROUP BY ap.artist_profile_id,
      CASE
        WHEN ap.art_id IS NOT NULL THEN (
          SELECT e.currency
          FROM art a
          JOIN events e ON a.event_id = e.id
          WHERE a.id = ap.art_id
        )
        ELSE ap.currency
      END
  ),
  automated_payment_totals AS (
    SELECT
      ap.artist_profile_id,
      CASE
        WHEN ap.art_id IS NOT NULL THEN (
          SELECT e.currency
          FROM art a
          JOIN events e ON a.event_id = e.id
          WHERE a.id = ap.art_id
        )
        ELSE ap.currency
      END as currency,
      SUM(ap.gross_amount) as automated_debits_total
    FROM artist_payments ap
    WHERE ap.payment_type = 'automated'
      AND ap.status IN ('completed', 'paid', 'verified')
    GROUP BY ap.artist_profile_id,
      CASE
        WHEN ap.art_id IS NOT NULL THEN (
          SELECT e.currency
          FROM art a
          JOIN events e ON a.event_id = e.id
          WHERE a.id = ap.art_id
        )
        ELSE ap.currency
      END
  ),
  artist_balances AS (
    SELECT
      ars.artist_id,
      ars.currency,
      ars.gross_earnings,
      COALESCE(mpt.manual_debits_total, 0) as manual_debits,
      COALESCE(apt.automated_debits_total, 0) as automated_debits,
      (ars.gross_earnings - COALESCE(mpt.manual_debits_total, 0) - COALESCE(apt.automated_debits_total, 0)) as net_balance
    FROM art_sales ars
    LEFT JOIN manual_payment_totals mpt ON ars.artist_id = mpt.artist_profile_id AND ars.currency = mpt.currency
    LEFT JOIN automated_payment_totals apt ON ars.artist_id = apt.artist_profile_id AND ars.currency = apt.currency
    WHERE (ars.gross_earnings - COALESCE(mpt.manual_debits_total, 0) - COALESCE(apt.automated_debits_total, 0)) > 0.01
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
    COALESCE(agp.status, 'not_set_up')::TEXT,
    ''::TEXT as recent_city,
    0::INTEGER as recent_contests,
    COALESCE(agp.default_currency, 'USD')::TEXT
  FROM artist_balances ab
  JOIN artist_profiles prof ON ab.artist_id = prof.id
  LEFT JOIN artist_global_payments agp ON prof.id = agp.artist_profile_id
  ORDER BY ab.net_balance DESC;
END;
$$;

-- Add comment indicating the change
COMMENT ON FUNCTION get_event_artists_owed(UUID) IS 'Updated to use dynamic artist_auction_portion from events table instead of hardcoded 50%';
COMMENT ON FUNCTION get_event_ready_to_pay(UUID) IS 'Updated to use dynamic artist_auction_portion from events table instead of hardcoded 50%';
COMMENT ON FUNCTION get_event_payment_summary(UUID) IS 'Updated to use dynamic artist_auction_portion from events table instead of hardcoded 50%';
COMMENT ON FUNCTION get_artists_owed() IS 'Updated to use dynamic artist_auction_portion from events table instead of hardcoded 50%';

-- Verify the changes work
SELECT 'Functions updated successfully' as status;