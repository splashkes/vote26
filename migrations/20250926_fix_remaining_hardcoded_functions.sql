-- Fix remaining functions with hardcoded 0.5 calculations
-- Found: audit_payment_setup_invitations, get_simple_admin_payments_data, get_ready_to_pay_artists

-- 1. Fix audit_payment_setup_invitations function
DROP FUNCTION IF EXISTS audit_payment_setup_invitations(INTEGER);

CREATE OR REPLACE FUNCTION audit_payment_setup_invitations(days_back INTEGER DEFAULT 7)
RETURNS TABLE (
    artist_name TEXT,
    artist_profile_id UUID,
    person_id TEXT,
    inv_count BIGINT,
    last_sent TIMESTAMPTZ,
    methods TEXT,
    has_art_sales BOOLEAN,
    sales_count BIGINT,
    total_earnings NUMERIC,
    has_payments_received BOOLEAN,
    payment_count BIGINT,
    total_paid NUMERIC,
    estimated_balance NUMERIC
)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    WITH invitation_summary AS (
        -- Get summary of invitations per artist
        SELECT
            psi.artist_profile_id,
            COUNT(*) as inv_count,
            MAX(psi.sent_at) as last_sent,
            STRING_AGG(DISTINCT psi.invitation_method, ', ' ORDER BY psi.invitation_method) as methods
        FROM payment_setup_invitations psi
        WHERE psi.sent_at >= (NOW() - INTERVAL '1 day' * days_back)
        GROUP BY psi.artist_profile_id
    ),
    artist_info AS (
        -- Get artist profile details
        SELECT
            inv.artist_profile_id,
            inv.inv_count,
            inv.last_sent,
            inv.methods,
            ap.name as artist_name,
            ap.person_id
        FROM invitation_summary inv
        JOIN artist_profiles ap ON inv.artist_profile_id = ap.id
    ),
    art_sales AS (
        -- Get art sales for these artists (matching artist-account-ledger logic)
        SELECT
            ai.artist_profile_id,
            COUNT(a.id) as sales_count,
            SUM(CASE
                WHEN a.status IN ('sold', 'paid') THEN
                    -- FIXED: Use dynamic artist_auction_portion instead of hardcoded 0.5
                    COALESCE(a.final_price, a.current_bid, 0) * e.artist_auction_portion
                ELSE 0
            END) as total_earnings
        FROM artist_info ai
        LEFT JOIN art a ON a.artist_id = ai.artist_profile_id
        LEFT JOIN events e ON a.event_id = e.id  -- Added JOIN to get artist_auction_portion
        WHERE a.status IN ('sold', 'paid', 'closed')  -- Match the exact status filter
        AND COALESCE(a.final_price, a.current_bid, 0) > 0
        GROUP BY ai.artist_profile_id
    ),
    payments_received AS (
        -- Get payments made to these artists
        SELECT
            ai.artist_profile_id,
            COUNT(ap.id) as payment_count,
            SUM(ap.net_amount) as total_paid
        FROM artist_info ai
        LEFT JOIN artist_payments ap ON ap.artist_profile_id = ai.artist_profile_id
        WHERE ap.status = 'completed' AND ap.net_amount > 0
        GROUP BY ai.artist_profile_id
    )
    SELECT
        ai.artist_name::TEXT,
        ai.artist_profile_id,
        ai.person_id,
        ai.inv_count,
        ai.last_sent,
        ai.methods::TEXT,
        COALESCE(asales.sales_count, 0) > 0 as has_art_sales,
        COALESCE(asales.sales_count, 0),
        COALESCE(asales.total_earnings, 0),
        COALESCE(apay.payment_count, 0) > 0 as has_payments_received,
        COALESCE(apay.payment_count, 0),
        COALESCE(apay.total_paid, 0),
        COALESCE(asales.total_earnings, 0) - COALESCE(apay.total_paid, 0) as estimated_balance
    FROM artist_info ai
    LEFT JOIN art_sales asales ON ai.artist_profile_id = asales.artist_profile_id
    LEFT JOIN payments_received apay ON ai.artist_profile_id = apay.artist_profile_id
    ORDER BY (COALESCE(asales.total_earnings, 0) - COALESCE(apay.total_paid, 0)) DESC, ai.last_sent DESC;
END;
$$;

-- 2. Fix get_simple_admin_payments_data function
DROP FUNCTION IF EXISTS get_simple_admin_payments_data(INTEGER);

CREATE OR REPLACE FUNCTION get_simple_admin_payments_data(days_back INTEGER DEFAULT 90)
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
  is_recent_contestant BOOLEAN
)
LANGUAGE SQL AS $$
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
      -- FIXED: Use dynamic artist_auction_portion instead of hardcoded 0.5
      SUM(COALESCE(a.final_price, a.current_bid, 0) * e.artist_auction_portion) as sales_total
    FROM art a
    JOIN artist_profiles ap ON a.artist_id = ap.id
    JOIN events e ON a.event_id = e.id  -- Added JOIN to get artist_auction_portion
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

-- 3. Fix get_ready_to_pay_artists function
DROP FUNCTION IF EXISTS get_ready_to_pay_artists();

CREATE OR REPLACE FUNCTION get_ready_to_pay_artists()
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
  recent_contests INTEGER
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH art_sales AS (
    SELECT
      ap.id as artist_id,
      -- FIXED: Use dynamic artist_auction_portion instead of hardcoded 0.5
      SUM(COALESCE(a.final_price, a.current_bid, 0) * e.artist_auction_portion) as sales_total
    FROM art a
    JOIN artist_profiles ap ON a.artist_id = ap.id
    JOIN events e ON a.event_id = e.id  -- Added JOIN to get artist_auction_portion
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
    ap.id::UUID,
    ap.name::TEXT,
    ap.email::TEXT,
    ap.phone::TEXT,
    ap.entry_id::INTEGER,
    ap.country::TEXT,
    GREATEST(0, COALESCE(asales.sales_total, 0) - COALESCE(pd.debits_total, 0))::NUMERIC,
    'USD'::TEXT,
    'ready'::TEXT,
    agp.stripe_recipient_id::TEXT,
    COALESCE(rei.event_city, 'No recent events')::TEXT,
    COALESCE(rei.contest_count, 0)::INTEGER
  FROM artist_profiles ap
  JOIN artist_global_payments agp ON ap.id = agp.artist_profile_id
  LEFT JOIN art_sales asales ON ap.id = asales.artist_id
  LEFT JOIN payment_debits pd ON ap.id = pd.artist_profile_id
  LEFT JOIN active_payment_attempts apa ON ap.id = apa.artist_profile_id
  LEFT JOIN recent_event_info rei ON ap.id = rei.artist_id AND rei.rn = 1
  WHERE agp.status = 'ready'  -- Only artists with ready payment accounts
    AND agp.stripe_recipient_id IS NOT NULL  -- Must have Stripe account
    AND GREATEST(0, COALESCE(asales.sales_total, 0) - COALESCE(pd.debits_total, 0)) > 0.01  -- Must have balance
    AND apa.artist_profile_id IS NULL  -- Exclude artists with active payment attempts
  ORDER BY GREATEST(0, COALESCE(asales.sales_total, 0) - COALESCE(pd.debits_total, 0)) DESC;
END;
$$;

COMMENT ON FUNCTION audit_payment_setup_invitations(INTEGER) IS 'FIXED: Now uses dynamic artist_auction_portion from events table instead of hardcoded 50%';
COMMENT ON FUNCTION get_simple_admin_payments_data(INTEGER) IS 'FIXED: Now uses dynamic artist_auction_portion from events table instead of hardcoded 50%';
COMMENT ON FUNCTION get_ready_to_pay_artists() IS 'FIXED: Now uses dynamic artist_auction_portion from events table instead of hardcoded 50%';

SELECT 'Fixed remaining hardcoded functions with dynamic percentage calculations' as status;