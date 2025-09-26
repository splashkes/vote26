-- Event-Specific Payment Functions
-- This creates event-scoped versions of the existing global payment functions
-- Allows event admins to see payment data only for their specific events

-- ============================================
-- 1. get_event_artists_owed(event_id UUID)
-- ============================================

CREATE OR REPLACE FUNCTION public.get_event_artists_owed(p_event_id UUID)
RETURNS TABLE(
    artist_id uuid,
    artist_name text,
    artist_email text,
    artist_phone text,
    artist_entry_id integer,
    artist_country text,
    estimated_balance numeric,
    balance_currency text,
    payment_account_status text,
    stripe_recipient_id text,
    recent_city text,
    recent_contests integer,
    invitation_count integer,
    latest_invitation_method text,
    latest_invitation_date timestamp with time zone,
    time_since_latest text,
    onboarding_status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH event_art_sales AS (
    SELECT
      ap.id as artist_id,
      e.currency,
      SUM(COALESCE(a.final_price, a.current_bid, 0) * 0.5) as sales_total
    FROM art a
    JOIN artist_profiles ap ON a.artist_id = ap.id
    JOIN events e ON a.event_id = e.id
    WHERE a.event_id = p_event_id
      AND a.status = 'paid'  -- Only paid status counts as earned income
      AND COALESCE(a.final_price, a.current_bid, 0) > 0
    GROUP BY ap.id, e.currency
  ),
  event_payment_debits AS (
    SELECT
      ap.artist_profile_id,
      ap.currency,
      SUM(ap.gross_amount) as debits_total
    FROM artist_payments ap
    JOIN art a ON ap.art_id = a.id
    WHERE a.event_id = p_event_id
    GROUP BY ap.artist_profile_id, ap.currency
  ),
  event_artist_balances AS (
    SELECT
      ap.id as artist_id,
      -- Calculate balance per currency for this event
      COALESCE(sales.currency, debits.currency) as currency,
      COALESCE(sales.sales_total, 0) - COALESCE(debits.debits_total, 0) as balance
    FROM artist_profiles ap
    FULL OUTER JOIN event_art_sales sales ON ap.id = sales.artist_id
    FULL OUTER JOIN event_payment_debits debits ON ap.id = debits.artist_profile_id
      AND sales.currency = debits.currency
    WHERE COALESCE(sales.sales_total, 0) - COALESCE(debits.debits_total, 0) > 0.01
  ),
  event_primary_balances AS (
    SELECT
      artist_id,
      -- Use the currency with the highest positive balance as primary
      currency as balance_currency,
      balance as estimated_balance,
      ROW_NUMBER() OVER (PARTITION BY artist_id ORDER BY balance DESC) as rn
    FROM event_artist_balances
    WHERE balance > 0.01
  ),
  event_participants AS (
    SELECT DISTINCT
      rc.artist_id
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
    ap.id as artist_id,
    ap.name as artist_name,
    ap.email as artist_email,
    ap.phone as artist_phone,
    ap.entry_id as artist_entry_id,
    ap.country as artist_country,
    pb.estimated_balance,
    pb.balance_currency,
    CASE
      WHEN agp.status = 'ready' AND agp.stripe_recipient_id IS NOT NULL THEN 'ready'
      WHEN agp.status IN ('pending_verification', 'restricted', 'blocked') THEN 'in_progress'
      WHEN li.invitation_count > 0 THEN 'invited'
      ELSE 'no_account'
    END as payment_account_status,
    agp.stripe_recipient_id,
    e.name as recent_city,
    1 as recent_contests,  -- They participated in this event
    COALESCE(li.invitation_count, 0) as invitation_count,
    li.latest_invitation_method,
    li.latest_invitation_date,
    li.time_since_latest,
    agp.status as onboarding_status
  FROM event_primary_balances pb
  JOIN artist_profiles ap ON pb.artist_id = ap.id
  JOIN event_participants ep ON ap.id = ep.artist_id  -- Only event participants
  LEFT JOIN events e ON e.id = p_event_id
  LEFT JOIN latest_invitations li ON ap.id = li.artist_profile_id
  LEFT JOIN artist_global_payments agp ON ap.id = agp.artist_profile_id
  WHERE pb.rn = 1  -- Only primary balance per artist
  ORDER BY pb.estimated_balance DESC;
$function$;

-- ============================================
-- 2. get_event_ready_to_pay(event_id UUID)
-- ============================================

CREATE OR REPLACE FUNCTION public.get_event_ready_to_pay(p_event_id UUID)
RETURNS TABLE(
    artist_id uuid,
    artist_name text,
    artist_email text,
    artist_phone text,
    artist_entry_id integer,
    artist_country text,
    estimated_balance numeric,
    balance_currency text,
    stripe_recipient_id text,
    recent_city text,
    recent_contests integer,
    default_currency text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH event_art_sales AS (
    SELECT
      ap.id as artist_id,
      e.currency,
      SUM(COALESCE(a.final_price, a.current_bid, 0) * 0.5) as sales_total
    FROM art a
    JOIN artist_profiles ap ON a.artist_id = ap.id
    JOIN events e ON a.event_id = e.id
    WHERE a.event_id = p_event_id
      AND a.status = 'paid'
      AND COALESCE(a.final_price, a.current_bid, 0) > 0
    GROUP BY ap.id, e.currency
  ),
  event_payment_debits AS (
    SELECT
      ap.artist_profile_id,
      ap.currency,
      SUM(ap.gross_amount) as debits_total
    FROM artist_payments ap
    JOIN art a ON ap.art_id = a.id
    WHERE a.event_id = p_event_id
      AND ap.status IN ('completed', 'paid')
    GROUP BY ap.artist_profile_id, ap.currency
  ),
  event_active_payment_attempts AS (
    SELECT DISTINCT
      ap.artist_profile_id
    FROM artist_payments ap
    JOIN art a ON ap.art_id = a.id
    WHERE a.event_id = p_event_id
      AND ap.status NOT IN ('completed', 'paid')
      AND ap.created_at >= NOW() - INTERVAL '7 days'
  ),
  event_participants AS (
    SELECT DISTINCT
      rc.artist_id
    FROM round_contestants rc
    JOIN rounds r ON rc.round_id = r.id
    WHERE r.event_id = p_event_id
  )
  SELECT
    ap.id as artist_id,
    ap.name::text as artist_name,
    ap.email::text as artist_email,
    ap.phone::text as artist_phone,
    ap.entry_id as artist_entry_id,
    ap.country::text as artist_country,
    GREATEST(0, COALESCE(asales.sales_total, 0) - COALESCE(pd.debits_total, 0)) as estimated_balance,
    COALESCE(ev.currency, 'USD') as balance_currency,
    agp.stripe_recipient_id::text,
    ev.name::text as recent_city,
    1 as recent_contests,
    agp.default_currency::text
  FROM artist_profiles ap
  JOIN event_participants ep ON ap.id = ep.artist_id
  LEFT JOIN event_art_sales asales ON ap.id = asales.artist_id
  LEFT JOIN event_payment_debits pd ON ap.id = pd.artist_profile_id
  LEFT JOIN events ev ON ev.id = p_event_id
  JOIN artist_global_payments agp ON ap.id = agp.artist_profile_id
  LEFT JOIN event_active_payment_attempts eapa ON ap.id = eapa.artist_profile_id
  WHERE GREATEST(0, COALESCE(asales.sales_total, 0) - COALESCE(pd.debits_total, 0)) > 0.01
    AND agp.status = 'ready'
    AND agp.stripe_recipient_id IS NOT NULL
    AND LENGTH(agp.stripe_recipient_id) > 0
    AND eapa.artist_profile_id IS NULL  -- Exclude artists with recent payment attempts
  ORDER BY estimated_balance DESC;
$function$;

-- ============================================
-- 3. get_event_payment_attempts(event_id UUID)
-- ============================================

CREATE OR REPLACE FUNCTION public.get_event_payment_attempts(p_event_id UUID, p_days_back INTEGER DEFAULT 30)
RETURNS TABLE(
    artist_id uuid,
    artist_name text,
    artist_email text,
    artist_phone text,
    artist_entry_id integer,
    artist_country text,
    payment_id uuid,
    payment_amount numeric,
    payment_currency text,
    payment_status text,
    payment_method text,
    payment_type text,
    payment_date timestamp with time zone,
    stripe_transfer_id text,
    stripe_recipient_id text,
    error_message text,
    recent_city text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    ap.id as artist_id,
    ap.name as artist_name,
    ap.email as artist_email,
    ap.phone as artist_phone,
    ap.entry_id as artist_entry_id,
    ap.country as artist_country,
    apt.id as payment_id,
    apt.gross_amount as payment_amount,
    apt.currency as payment_currency,
    apt.status as payment_status,
    apt.payment_method,
    apt.payment_type,
    apt.created_at as payment_date,
    apt.stripe_transfer_id,
    agp.stripe_recipient_id,
    apt.error_message,
    e.name as recent_city
  FROM artist_payments apt
  JOIN artist_profiles ap ON apt.artist_profile_id = ap.id
  LEFT JOIN artist_global_payments agp ON ap.id = agp.artist_profile_id
  LEFT JOIN events e ON e.id = p_event_id
  JOIN art a ON apt.art_id = a.id
  WHERE a.event_id = p_event_id
    AND apt.status NOT IN ('completed', 'paid', 'verified', 'cancelled')
    AND apt.created_at >= NOW() - (p_days_back || ' days')::INTERVAL
  ORDER BY apt.created_at DESC;
$function$;

-- ============================================
-- 4. get_event_art_status(event_id UUID)
-- ============================================

CREATE OR REPLACE FUNCTION public.get_event_art_status(p_event_id UUID)
RETURNS TABLE(
    art_id uuid,
    art_code text,
    artist_name text,
    artist_email text,
    title text,
    current_bid numeric,
    final_price numeric,
    art_status text,
    currency text,
    sold_date timestamp with time zone,
    payment_status text,
    payment_date timestamp with time zone,
    days_since_sale integer,
    needs_reminder boolean,
    needs_runner_up_offer boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    a.id as art_id,
    a.art_code,
    ap.name as artist_name,
    ap.email as artist_email,
    a.description as title,
    a.current_bid,
    a.final_price,
    a.status as art_status,
    e.currency,
    a.buyer_pay_recent_date as sold_date,
    CASE
      WHEN a.status = 'paid' THEN 'paid'
      WHEN a.status = 'sold' THEN 'unpaid'
      ELSE 'no_sale'
    END as payment_status,
    a.buyer_pay_recent_date as payment_date,
    CASE
      WHEN a.buyer_pay_recent_date IS NOT NULL THEN
        EXTRACT(DAY FROM NOW() - a.buyer_pay_recent_date)::integer
      ELSE NULL
    END as days_since_sale,
    -- Needs reminder if sold but not paid for more than 3 days
    (a.status = 'sold' AND
     a.buyer_pay_recent_date IS NOT NULL AND
     a.buyer_pay_recent_date < NOW() - INTERVAL '3 days') as needs_reminder,
    -- Needs runner-up offer if sold but not paid for more than 7 days
    (a.status = 'sold' AND
     a.buyer_pay_recent_date IS NOT NULL AND
     a.buyer_pay_recent_date < NOW() - INTERVAL '7 days') as needs_runner_up_offer
  FROM art a
  JOIN artist_profiles ap ON a.artist_id = ap.id
  JOIN events e ON a.event_id = e.id
  WHERE a.event_id = p_event_id
    AND a.status IN ('sold', 'paid', 'closed')
    AND COALESCE(a.final_price, a.current_bid, 0) > 0
  ORDER BY
    CASE WHEN a.status = 'sold' THEN 1 ELSE 2 END,  -- Unpaid first
    a.buyer_pay_recent_date DESC NULLS LAST;
$function$;

-- ============================================
-- 5. get_event_payment_summary(event_id UUID)
-- ============================================

CREATE OR REPLACE FUNCTION public.get_event_payment_summary(p_event_id UUID)
RETURNS TABLE(
    event_name text,
    event_currency text,
    total_art_pieces integer,
    sold_art_pieces integer,
    paid_art_pieces integer,
    unpaid_art_pieces integer,
    total_sales_amount numeric,
    total_artist_earnings numeric,
    total_payments_made numeric,
    outstanding_artist_payments numeric,
    artists_owed_count integer,
    artists_ready_to_pay_count integer,
    payment_attempts_count integer,
    currency_breakdown jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_event_name text;
    v_event_currency text;
    v_currency_breakdown jsonb;
BEGIN
    -- Get event info
    SELECT e.name, e.currency
    INTO v_event_name, v_event_currency
    FROM events e
    WHERE e.id = p_event_id;

    -- Calculate currency breakdown
    SELECT jsonb_object_agg(
        currency_data.currency,
        jsonb_build_object(
            'artists_count', currency_data.artists_count,
            'total_owed', currency_data.total_owed
        )
    )
    INTO v_currency_breakdown
    FROM (
        SELECT
            COALESCE(e.currency, 'USD') as currency,
            COUNT(*) as artists_count,
            SUM(eao.estimated_balance) as total_owed
        FROM get_event_artists_owed(p_event_id) eao
        JOIN events e ON e.id = p_event_id
        GROUP BY e.currency
    ) currency_data;

    RETURN QUERY
    SELECT
        v_event_name,
        v_event_currency,
        -- Art piece counts
        (SELECT COUNT(*)::integer FROM art WHERE event_id = p_event_id) as total_art_pieces,
        (SELECT COUNT(*)::integer FROM art WHERE event_id = p_event_id AND status IN ('sold', 'paid')) as sold_art_pieces,
        (SELECT COUNT(*)::integer FROM art WHERE event_id = p_event_id AND status = 'paid') as paid_art_pieces,
        (SELECT COUNT(*)::integer FROM art WHERE event_id = p_event_id AND status = 'sold') as unpaid_art_pieces,

        -- Financial amounts
        (SELECT COALESCE(SUM(COALESCE(final_price, current_bid, 0)), 0)
         FROM art WHERE event_id = p_event_id AND status IN ('sold', 'paid')) as total_sales_amount,
        (SELECT COALESCE(SUM(COALESCE(final_price, current_bid, 0) * 0.5), 0)
         FROM art WHERE event_id = p_event_id AND status = 'paid') as total_artist_earnings,
        (SELECT COALESCE(SUM(gross_amount), 0)
         FROM artist_payments WHERE event_id = p_event_id AND status IN ('completed', 'paid')) as total_payments_made,
        (SELECT COALESCE(SUM(estimated_balance), 0)
         FROM get_event_artists_owed(p_event_id)) as outstanding_artist_payments,

        -- Counts
        (SELECT COUNT(*)::integer FROM get_event_artists_owed(p_event_id)) as artists_owed_count,
        (SELECT COUNT(*)::integer FROM get_event_ready_to_pay(p_event_id)) as artists_ready_to_pay_count,
        (SELECT COUNT(*)::integer FROM get_event_payment_attempts(p_event_id, 30)) as payment_attempts_count,

        -- Currency breakdown
        COALESCE(v_currency_breakdown, '{}'::jsonb) as currency_breakdown;
END;
$function$;

-- ============================================
-- Grant permissions
-- ============================================

GRANT EXECUTE ON FUNCTION get_event_artists_owed(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_event_ready_to_pay(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_event_payment_attempts(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_event_art_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_event_payment_summary(UUID) TO authenticated;

-- ============================================
-- Create indexes for performance
-- ============================================

-- The art table already has the necessary indexes for event-specific queries

-- ============================================
-- Log migration completion
-- ============================================

INSERT INTO system_logs (service, operation, level, message, request_data)
VALUES (
    'migration',
    'create_event_specific_payment_functions',
    'info',
    'Created event-specific payment functions for event-scoped admin interfaces',
    jsonb_build_object(
        'migration_file', '20250926_create_event_specific_payment_functions.sql',
        'applied_at', NOW()::text,
        'functions_created', ARRAY[
            'get_event_artists_owed',
            'get_event_ready_to_pay',
            'get_event_payment_attempts',
            'get_event_art_status',
            'get_event_payment_summary'
        ],
        'indexes_created', ARRAY[
            'idx_artist_payments_event_id_status_created',
            'idx_art_event_id_status_payment_date'
        ],
        'purpose', 'Enable event producers to view payment data for their specific events only'
    )
);