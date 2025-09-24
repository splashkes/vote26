-- Complete admin payments function using simple approach
CREATE OR REPLACE FUNCTION get_simple_admin_payments_data(days_back integer)
RETURNS TABLE (
  artist_id uuid,
  artist_name text,
  artist_email text,
  artist_phone text,
  artist_entry_id integer,
  artist_country text,
  artist_person_id text,
  artist_created_at timestamptz,
  payment_account_status text,
  stripe_recipient_id text,
  estimated_balance numeric,
  latest_payment_status text,
  payment_pending_count bigint,
  payment_processing_count bigint,
  payment_completed_count bigint,
  payment_failed_count bigint,
  payment_manual_count bigint,
  recent_city text,
  recent_contests bigint,
  is_recent_contestant boolean
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH recent_contestants AS (
    SELECT
      ap.id as artist_id,
      COUNT(DISTINCT r.id) as contest_count,
      COALESCE(c.name, 'Unknown') as city_name
    FROM round_contestants rc
    JOIN rounds r ON rc.round_id = r.id
    JOIN events e ON r.event_id = e.id
    JOIN artist_profiles ap ON rc.artist_id = ap.id
    LEFT JOIN cities c ON e.city_id = c.id
    WHERE e.event_start_datetime >= NOW() - (days_back || ' days')::INTERVAL
    GROUP BY ap.id, c.name
  ),
  art_sales AS (
    SELECT
      ap.id as artist_id,
      SUM(COALESCE(a.final_price, a.current_bid, 0) * 0.5) as sales_total
    FROM art a
    JOIN artist_profiles ap ON a.artist_id = ap.id
    WHERE a.status IN ('sold', 'paid', 'closed')
      AND COALESCE(a.final_price, a.current_bid, 0) > 0
    GROUP BY ap.id
  ),
  payment_debits AS (
    SELECT
      ap.artist_profile_id,
      SUM(ap.gross_amount) as debits_total
    FROM artist_payments ap
    WHERE ap.status IN ('completed', 'paid')
    GROUP BY ap.artist_profile_id
  ),
  payment_history AS (
    SELECT
      ap.artist_profile_id,
      COUNT(*) FILTER (WHERE ap.status = 'pending') as pending_count,
      COUNT(*) FILTER (WHERE ap.status = 'processing') as processing_count,
      COUNT(*) FILTER (WHERE ap.status = 'completed') as completed_count,
      COUNT(*) FILTER (WHERE ap.status = 'failed') as failed_count,
      COUNT(*) FILTER (WHERE ap.payment_type = 'manual') as manual_count
    FROM artist_payments ap
    GROUP BY ap.artist_profile_id
  ),
  latest_payments AS (
    SELECT DISTINCT ON (ap.artist_profile_id)
      ap.artist_profile_id,
      ap.status as latest_status
    FROM artist_payments ap
    ORDER BY ap.artist_profile_id, ap.created_at DESC
  )
  SELECT
    ap.id as artist_id,
    ap.name as artist_name,
    ap.email as artist_email,
    ap.phone as artist_phone,
    ap.entry_id as artist_entry_id,
    ap.country as artist_country,
    ap.person_id as artist_person_id,
    ap.created_at as artist_created_at,
    CASE
      WHEN agp.status = 'completed' THEN 'ready'
      WHEN agp.status = 'pending' THEN 'invited'
      WHEN agp.status = 'ready' THEN 'ready'
      WHEN agp.status = 'invited' THEN 'invited'
      WHEN agp.status IS NOT NULL THEN 'needs_setup'
      ELSE NULL
    END as payment_account_status,
    agp.stripe_recipient_id,
    GREATEST(0, COALESCE(asales.sales_total, 0) - COALESCE(pd.debits_total, 0)) as estimated_balance,
    lp.latest_status as latest_payment_status,
    COALESCE(ph.pending_count, 0) as payment_pending_count,
    COALESCE(ph.processing_count, 0) as payment_processing_count,
    COALESCE(ph.completed_count, 0) as payment_completed_count,
    COALESCE(ph.failed_count, 0) as payment_failed_count,
    COALESCE(ph.manual_count, 0) as payment_manual_count,
    COALESCE(rc.city_name, 'Unknown') as recent_city,
    COALESCE(rc.contest_count, 0) as recent_contests,
    (rc.artist_id IS NOT NULL) as is_recent_contestant
  FROM artist_profiles ap
  LEFT JOIN artist_global_payments agp ON ap.id = agp.artist_profile_id
  LEFT JOIN recent_contestants rc ON ap.id = rc.artist_id
  LEFT JOIN art_sales asales ON ap.id = asales.artist_id
  LEFT JOIN payment_debits pd ON ap.id = pd.artist_profile_id
  LEFT JOIN payment_history ph ON ap.id = ph.artist_profile_id
  LEFT JOIN latest_payments lp ON ap.id = lp.artist_profile_id
  ORDER BY ap.name;
$$;