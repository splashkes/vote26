-- Fix get_completed_payments function to include 'verified' status
-- This ensures that verified payments appear in the "Completed Payments" tab in admin interface

-- Drop existing function first
DROP FUNCTION IF EXISTS public.get_completed_payments(integer);

CREATE OR REPLACE FUNCTION public.get_completed_payments(days_back integer DEFAULT 90)
RETURNS TABLE(
    artist_id uuid,
    artist_name text,
    artist_email text,
    artist_phone text,
    artist_entry_id integer,
    artist_country text,
    recent_city text,
    payment_id uuid,
    payment_amount numeric,
    payment_currency text,
    payment_status text,
    payment_method text,
    payment_type text,
    payment_date timestamp with time zone,
    completion_date timestamp with time zone,
    stripe_transfer_id text,
    stripe_recipient_id text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    ap.name as artist_name,
    ap.email as artist_email,
    ap.phone as artist_phone,
    ap.entry_id as artist_entry_id,
    ap.country as artist_country,
    rei.event_city as recent_city,
    apt.id as payment_id,
    apt.net_amount as payment_amount,
    apt.currency as payment_currency,
    apt.status as payment_status,
    apt.payment_method as payment_method,
    apt.payment_type as payment_type,
    apt.created_at as payment_date,
    COALESCE(apt.webhook_confirmed_at, apt.paid_at, apt.updated_at) as completion_date,
    apt.stripe_transfer_id as stripe_transfer_id,
    agp.stripe_recipient_id as stripe_recipient_id
  FROM artist_profiles ap
  JOIN artist_payments apt ON ap.id = apt.artist_profile_id
  LEFT JOIN artist_global_payments agp ON ap.id = agp.artist_profile_id
  LEFT JOIN recent_event_info rei ON ap.id = rei.artist_id AND rei.rn = 1
  WHERE apt.created_at >= NOW() - (days_back || ' days')::INTERVAL
    AND apt.status IN ('completed', 'paid', 'verified')  -- Include verified status from webhook confirmation
  ORDER BY COALESCE(apt.webhook_confirmed_at, apt.paid_at, apt.updated_at) DESC;
$function$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_completed_payments(integer) TO authenticated;

-- Log migration completion
INSERT INTO system_logs (service, operation, level, message, request_data)
VALUES (
    'migration',
    'fix_completed_payments_verified',
    'info',
    'Updated get_completed_payments function to include verified status payments',
    jsonb_build_object(
        'migration_file', '20250926_fix_completed_payments_include_verified.sql',
        'applied_at', NOW()::text,
        'includes_statuses', ARRAY['completed', 'paid', 'verified']
    )
);