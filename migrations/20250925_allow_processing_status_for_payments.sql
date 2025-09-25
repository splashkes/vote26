-- Migration: Allow 'processing' status artists to be processed again
-- This removes 'processing' from the active_payment_attempts exclusion list
-- so that artists stuck in 'processing' status can be re-processed

DROP FUNCTION IF EXISTS get_ready_to_pay_artists();

CREATE FUNCTION get_ready_to_pay_artists()
RETURNS TABLE (
  artist_id uuid, artist_name text, artist_email text, artist_phone text,
  artist_entry_id integer, artist_country text, estimated_balance numeric,
  stripe_recipient_id text, recent_city text, recent_contests integer, default_currency text
)
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH art_sales AS (
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
  active_payment_attempts AS (
    SELECT DISTINCT
      ap.artist_profile_id
    FROM artist_payments ap
    -- Exclude artists with any recent payment attempts to avoid duplicates with In Progress tab
    WHERE ap.status NOT IN ('completed', 'paid')
      AND ap.created_at >= NOW() - INTERVAL '7 days'
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
  )
  SELECT
    ap.id as artist_id,
    ap.name::text as artist_name,
    ap.email::text as artist_email,
    ap.phone::text as artist_phone,
    ap.entry_id as artist_entry_id,
    ap.country::text as artist_country,
    GREATEST(0, COALESCE(asales.sales_total, 0) - COALESCE(pd.debits_total, 0)) as estimated_balance,
    agp.stripe_recipient_id::text,
    rei.event_city::text as recent_city,
    rei.contest_count::integer as recent_contests,
    agp.default_currency::text
  FROM artist_profiles ap
  LEFT JOIN art_sales asales ON ap.id = asales.artist_id
  LEFT JOIN payment_debits pd ON ap.id = pd.artist_profile_id
  LEFT JOIN recent_event_info rei ON ap.id = rei.artist_id AND rei.rn = 1
  JOIN artist_global_payments agp ON ap.id = agp.artist_profile_id
  LEFT JOIN active_payment_attempts apa ON ap.id = apa.artist_profile_id
  WHERE GREATEST(0, COALESCE(asales.sales_total, 0) - COALESCE(pd.debits_total, 0)) > 0.01
    AND agp.status = 'ready'
    AND agp.stripe_recipient_id IS NOT NULL
    AND LENGTH(agp.stripe_recipient_id) > 0
    AND apa.artist_profile_id IS NULL  -- Exclude artists with truly active payment attempts (not 'processing')
  ORDER BY estimated_balance DESC;
END;
$$ LANGUAGE plpgsql;

-- Also update get_payment_attempts to exclude 'processing' status
-- so artists in 'processing' status only appear in Ready to Pay tab
DROP FUNCTION IF EXISTS get_payment_attempts(integer);
CREATE FUNCTION get_payment_attempts(days_back integer DEFAULT 90)
RETURNS TABLE (
  artist_id uuid, artist_name text, artist_email text, artist_phone text,
  artist_entry_id integer, artist_country text, estimated_balance numeric,
  payment_id uuid, payment_amount numeric, payment_currency text, payment_status text,
  payment_method text, payment_created_at timestamp with time zone, payment_updated_at timestamp with time zone,
  stripe_recipient_id text, recent_city text, is_recent_contestant boolean
)
SECURITY DEFINER
AS $func$
BEGIN
  RETURN QUERY
  WITH recent_event_info AS (
    SELECT
      rc.artist_id,
      c.name as event_city,
      ROW_NUMBER() OVER (PARTITION BY rc.artist_id ORDER BY e.event_start_datetime DESC) as rn
    FROM round_contestants rc
    JOIN rounds r ON rc.round_id = r.id
    JOIN events e ON r.event_id = e.id
    LEFT JOIN cities c ON e.city_id = c.id
    WHERE e.event_start_datetime >= NOW() - (days_back || ' days')::INTERVAL
  )
  SELECT
    ap.id as artist_id,
    ap.name::text as artist_name,
    ap.email::text as artist_email,
    ap.phone::text as artist_phone,
    ap.entry_id as artist_entry_id,
    ap.country::text as artist_country,
    0::numeric as estimated_balance,  -- Simplified for now
    apt.id as payment_id,
    apt.net_amount as payment_amount,
    apt.currency::text as payment_currency,
    apt.status::text as payment_status,
    apt.payment_method::text as payment_method,
    apt.created_at as payment_created_at,
    apt.updated_at as payment_updated_at,
    agp.stripe_recipient_id::text,
    rei.event_city::text as recent_city,
    (rei.artist_id IS NOT NULL) as is_recent_contestant
  FROM artist_profiles ap
  JOIN artist_payments apt ON ap.id = apt.artist_profile_id
  LEFT JOIN artist_global_payments agp ON ap.id = agp.artist_profile_id
  LEFT JOIN recent_event_info rei ON ap.id = rei.artist_id AND rei.rn = 1
  WHERE apt.created_at >= NOW() - (days_back || ' days')::INTERVAL
    AND apt.status NOT IN ('completed', 'paid')  -- Include 'processing' in In Progress tab
  ORDER BY apt.created_at DESC;
END;
$func$ LANGUAGE plpgsql;