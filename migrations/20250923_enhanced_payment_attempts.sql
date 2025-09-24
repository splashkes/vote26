-- Enhanced function for payment attempts (non-completed payments)
CREATE OR REPLACE FUNCTION get_payment_attempts(days_back integer DEFAULT 90)
RETURNS TABLE (
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
  payment_date timestamp with time zone,
  stripe_transfer_id text,
  error_message text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
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
    apt.created_at as payment_date,
    apt.stripe_transfer_id as stripe_transfer_id,
    apt.error_message as error_message
  FROM artist_profiles ap
  JOIN artist_payments apt ON ap.id = apt.artist_profile_id
  LEFT JOIN recent_event_info rei ON ap.id = rei.artist_id AND rei.rn = 1
  WHERE apt.created_at >= NOW() - (days_back || ' days')::INTERVAL
    AND apt.status NOT IN ('completed', 'paid')  -- Exclude completed payments
  ORDER BY apt.created_at DESC;
$$;

-- Enhanced function for completed payments only
CREATE OR REPLACE FUNCTION get_completed_payments(days_back integer DEFAULT 90)
RETURNS TABLE (
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
  payment_date timestamp with time zone,
  completion_date timestamp with time zone,
  stripe_transfer_id text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
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
    apt.created_at as payment_date,
    apt.updated_at as completion_date,
    apt.stripe_transfer_id as stripe_transfer_id
  FROM artist_profiles ap
  JOIN artist_payments apt ON ap.id = apt.artist_profile_id
  LEFT JOIN recent_event_info rei ON ap.id = rei.artist_id AND rei.rn = 1
  WHERE apt.created_at >= NOW() - (days_back || ' days')::INTERVAL
    AND apt.status IN ('completed', 'paid')  -- Only completed payments
  ORDER BY apt.updated_at DESC;
$$;