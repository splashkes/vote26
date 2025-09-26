-- Fix artists owed calculation to only include PAID art sales
-- This ensures we only count art where payment has actually been collected

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
  WITH art_sales AS (
    SELECT
      ap.id as artist_id,
      -- ONLY count PAID art sales (where payment has been collected)
      SUM(COALESCE(a.final_price, a.current_bid, 0) * 0.5) as sales_total
    FROM art a
    JOIN artist_profiles ap ON a.artist_id = ap.id
    WHERE a.status = 'paid'  -- ONLY paid status (not sold, not closed)
      AND COALESCE(a.final_price, a.current_bid, 0) > 0
    GROUP BY ap.id
  ),
  payment_debits AS (
    SELECT
      ap.artist_profile_id,
      -- Include ALL payments regardless of status to match ledger calculation
      SUM(ap.gross_amount) as debits_total
    FROM artist_payments ap
    GROUP BY ap.artist_profile_id
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
    -- Only count PAID art sales (not sold or closed)
    GREATEST(0, COALESCE(asales.sales_total, 0) - COALESCE(pd.debits_total, 0)) as estimated_balance,
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
  FROM artist_profiles ap
  LEFT JOIN art_sales asales ON ap.id = asales.artist_id
  LEFT JOIN payment_debits pd ON ap.id = pd.artist_profile_id
  LEFT JOIN recent_event_info rei ON ap.id = rei.artist_id AND rei.rn = 1
  LEFT JOIN latest_invitations li ON ap.id = li.artist_profile_id
  LEFT JOIN artist_global_payments agp ON ap.id = agp.artist_profile_id
  WHERE GREATEST(0, COALESCE(asales.sales_total, 0) - COALESCE(pd.debits_total, 0)) > 0.01
  ORDER BY estimated_balance DESC;
$function$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_enhanced_admin_artists_owed() TO authenticated;

-- Log migration completion
INSERT INTO system_logs (service, operation, level, message, request_data)
VALUES (
    'migration',
    'fix_artists_owed_only_paid_art',
    'info',
    'Updated get_enhanced_admin_artists_owed function to only count PAID art sales (not sold or closed)',
    jsonb_build_object(
        'migration_file', '20250926_fix_artists_owed_only_paid_art.sql',
        'applied_at', NOW()::text,
        'change_description', 'Changed art_sales CTE to only include status = paid',
        'previous_filter', 'status IN (sold, paid, closed)',
        'new_filter', 'status = paid',
        'rationale', 'Only count art where payment has actually been collected'
    )
);