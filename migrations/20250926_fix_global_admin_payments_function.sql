-- Fix get_admin_artist_payments_data function to use dynamic artist_auction_portion
-- This function is used for global artist payment data across all events

DROP FUNCTION IF EXISTS get_admin_artist_payments_data(timestamptz);

CREATE OR REPLACE FUNCTION get_admin_artist_payments_data(cutoff_date timestamptz)
RETURNS TABLE (
  artist_id UUID,
  artist_name TEXT,
  artist_email TEXT,
  artist_phone TEXT,
  artist_entry_id INTEGER,
  artist_country TEXT,
  artist_person_id TEXT,
  artist_created_at TIMESTAMPTZ,
  payment_account_status TEXT,
  stripe_recipient_id TEXT,
  estimated_balance NUMERIC,
  latest_payment_status TEXT,
  payment_pending_count BIGINT,
  payment_processing_count BIGINT,
  payment_completed_count BIGINT,
  payment_failed_count BIGINT,
  payment_manual_count BIGINT,
  recent_city TEXT,
  recent_contests BIGINT,
  is_recent_contestant BOOLEAN,
  art_sales_total NUMERIC,
  payment_debits_total NUMERIC
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH recent_contestants AS (
    SELECT DISTINCT
      ap.entry_id,
      COUNT(*) as contest_count,
      COALESCE(c.name, 'Unknown') as city_name
    FROM round_contestants rc
    JOIN rounds r ON rc.round_id = r.id
    JOIN events e ON r.event_id = e.id
    JOIN artist_profiles ap ON rc.artist_id = ap.id
    LEFT JOIN cities c ON e.city_id = c.id
    WHERE e.event_start_datetime >= cutoff_date
    GROUP BY ap.entry_id, c.name
  ),
  art_sales AS (
    SELECT
      ap.entry_id,
      -- FIXED: Use dynamic artist_auction_portion instead of hardcoded 0.5
      SUM(COALESCE(a.final_price, a.current_bid, 0) * e.artist_auction_portion) as sales_total
    FROM art a
    JOIN events e ON a.event_id = e.id -- Get event for artist_auction_portion
    JOIN artist_profiles ap ON a.artist_id = ap.id
    WHERE a.status IN ('sold', 'paid', 'closed')
      AND COALESCE(a.final_price, a.current_bid, 0) > 0
    GROUP BY ap.entry_id
  ),
  payment_debits AS (
    SELECT
      aprof.entry_id,
      SUM(ap.gross_amount) as debits_total
    FROM artist_payments ap
    JOIN artist_profiles aprof ON ap.artist_profile_id = aprof.id
    WHERE ap.status IN ('completed', 'paid')
    GROUP BY aprof.entry_id
  ),
  payment_history AS (
    SELECT
      aprof.entry_id,
      COUNT(*) FILTER (WHERE ap.status = 'pending') as pending_count,
      COUNT(*) FILTER (WHERE ap.status = 'processing') as processing_count,
      COUNT(*) FILTER (WHERE ap.status = 'completed') as completed_count,
      COUNT(*) FILTER (WHERE ap.status = 'failed') as failed_count,
      COUNT(*) FILTER (WHERE ap.payment_type = 'manual') as manual_count,
      MAX(ap.created_at) FILTER (WHERE ap.status IS NOT NULL) as latest_payment_date
    FROM artist_payments ap
    JOIN artist_profiles aprof ON ap.artist_profile_id = aprof.id
    GROUP BY aprof.entry_id
  ),
  latest_payments AS (
    SELECT DISTINCT ON (aprof.entry_id)
      aprof.entry_id,
      ap.status as latest_status
    FROM artist_payments ap
    JOIN artist_profiles aprof ON ap.artist_profile_id = aprof.id
    ORDER BY aprof.entry_id, ap.created_at DESC
  )
  SELECT
    ap.id::UUID,
    ap.name::TEXT,
    ap.email::TEXT,
    ap.phone::TEXT,
    ap.entry_id::INTEGER,
    ap.country::TEXT,
    ap.person_id::TEXT,
    ap.created_at::TIMESTAMPTZ,
    CASE
      WHEN agp.status = 'completed' THEN 'ready'
      WHEN agp.status = 'pending' THEN 'invited'
      WHEN agp.status = 'ready' THEN 'ready'
      WHEN agp.status = 'invited' THEN 'invited'
      WHEN agp.status IS NOT NULL THEN 'needs_setup'
      ELSE NULL
    END::TEXT,
    agp.stripe_recipient_id::TEXT,
    GREATEST(0, COALESCE(asales.sales_total, 0) - COALESCE(pd.debits_total, 0))::NUMERIC,
    lp.latest_status::TEXT,
    COALESCE(ph.pending_count, 0)::BIGINT,
    COALESCE(ph.processing_count, 0)::BIGINT,
    COALESCE(ph.completed_count, 0)::BIGINT,
    COALESCE(ph.failed_count, 0)::BIGINT,
    COALESCE(ph.manual_count, 0)::BIGINT,
    COALESCE(rc.city_name, 'Unknown')::TEXT,
    COALESCE(rc.contest_count, 0)::BIGINT,
    (rc.entry_id IS NOT NULL)::BOOLEAN,
    COALESCE(asales.sales_total, 0)::NUMERIC,
    COALESCE(pd.debits_total, 0)::NUMERIC
  FROM artist_profiles ap
  LEFT JOIN artist_global_payments agp ON ap.id = agp.artist_profile_id
  LEFT JOIN recent_contestants rc ON ap.entry_id = rc.entry_id
  LEFT JOIN art_sales asales ON ap.entry_id = asales.entry_id
  LEFT JOIN payment_debits pd ON ap.entry_id = pd.entry_id
  LEFT JOIN payment_history ph ON ap.entry_id = ph.entry_id
  LEFT JOIN latest_payments lp ON ap.entry_id = lp.entry_id
  ORDER BY ap.name;
END;
$$;

COMMENT ON FUNCTION get_admin_artist_payments_data(timestamptz) IS 'FIXED: Now uses dynamic artist_auction_portion from events table instead of hardcoded 50%';

SELECT 'Global admin payments function fixed with dynamic percentages' as status;