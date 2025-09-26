-- Fix artists owed calculation to be currency-aware
-- This ensures amounts are properly grouped by currency instead of mixing USD, CAD, AUD, etc.

-- Drop existing function first
DROP FUNCTION IF EXISTS public.get_enhanced_admin_artists_owed();

CREATE OR REPLACE FUNCTION public.get_enhanced_admin_artists_owed()
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
  WITH art_sales_by_currency AS (
    SELECT
      ap.id as artist_id,
      e.currency,
      SUM(COALESCE(a.final_price, a.current_bid, 0) * 0.5) as sales_total
    FROM art a
    JOIN artist_profiles ap ON a.artist_id = ap.id
    JOIN events e ON a.event_id = e.id
    WHERE a.status = 'paid'  -- Only paid status
      AND COALESCE(a.final_price, a.current_bid, 0) > 0
    GROUP BY ap.id, e.currency
  ),
  payment_debits_by_currency AS (
    SELECT
      ap.artist_profile_id,
      ap.currency,
      SUM(ap.gross_amount) as debits_total
    FROM artist_payments ap
    GROUP BY ap.artist_profile_id, ap.currency
  ),
  artist_balances AS (
    SELECT
      ap.id as artist_id,
      -- Calculate balance per currency
      COALESCE(sales.currency, debits.currency) as currency,
      COALESCE(sales.sales_total, 0) - COALESCE(debits.debits_total, 0) as balance
    FROM artist_profiles ap
    FULL OUTER JOIN art_sales_by_currency sales ON ap.id = sales.artist_id
    FULL OUTER JOIN payment_debits_by_currency debits ON ap.id = debits.artist_profile_id
      AND sales.currency = debits.currency
    WHERE COALESCE(sales.sales_total, 0) - COALESCE(debits.debits_total, 0) > 0.01
  ),
  primary_balances AS (
    SELECT
      artist_id,
      -- Use the currency with the highest positive balance as primary
      currency as balance_currency,
      balance as estimated_balance,
      ROW_NUMBER() OVER (PARTITION BY artist_id ORDER BY balance DESC) as rn
    FROM artist_balances
    WHERE balance > 0.01
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
    COALESCE(rei.event_city, 'No recent events') as recent_city,
    COALESCE(rei.contest_count, 0) as recent_contests,
    COALESCE(li.invitation_count, 0) as invitation_count,
    li.latest_invitation_method,
    li.latest_invitation_date,
    li.time_since_latest,
    agp.status as onboarding_status
  FROM primary_balances pb
  JOIN artist_profiles ap ON pb.artist_id = ap.id
  LEFT JOIN recent_event_info rei ON ap.id = rei.artist_id AND rei.rn = 1
  LEFT JOIN latest_invitations li ON ap.id = li.artist_profile_id
  LEFT JOIN artist_global_payments agp ON ap.id = agp.artist_profile_id
  WHERE pb.rn = 1  -- Only primary balance per artist
  ORDER BY pb.estimated_balance DESC;
$function$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_enhanced_admin_artists_owed() TO authenticated;

-- Log migration completion
INSERT INTO system_logs (service, operation, level, message, request_data)
VALUES (
    'migration',
    'fix_artists_owed_currency_aware',
    'info',
    'Updated get_enhanced_admin_artists_owed function to be currency-aware and show proper currency for each balance',
    jsonb_build_object(
        'migration_file', '20250926_fix_artists_owed_currency_aware.sql',
        'applied_at', NOW()::text,
        'change_description', 'Added currency-aware balance calculation with proper currency grouping',
        'new_column', 'balance_currency',
        'currencies_supported', ARRAY['USD', 'CAD', 'AUD', 'NZD']
    )
);