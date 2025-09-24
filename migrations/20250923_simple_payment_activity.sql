-- Simple function to show artists with payment activity (attempts, processing, completed)
CREATE OR REPLACE FUNCTION get_payment_activity(days_back integer DEFAULT 90)
RETURNS TABLE (
  artist_id uuid,
  artist_name text,
  artist_email text,
  latest_payment_status text,
  latest_payment_date timestamp with time zone,
  total_payments bigint,
  completed_payments bigint,
  pending_payments bigint,
  failed_payments bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ap.id as artist_id,
    ap.name as artist_name,
    ap.email as artist_email,
    apt.status as latest_payment_status,
    apt.created_at as latest_payment_date,
    COUNT(apt2.id) as total_payments,
    COUNT(CASE WHEN apt2.status IN ('completed', 'paid') THEN 1 END) as completed_payments,
    COUNT(CASE WHEN apt2.status IN ('pending', 'processing') THEN 1 END) as pending_payments,
    COUNT(CASE WHEN apt2.status = 'failed' THEN 1 END) as failed_payments
  FROM artist_profiles ap
  JOIN artist_payments apt ON ap.id = apt.artist_profile_id
  LEFT JOIN artist_payments apt2 ON ap.id = apt2.artist_profile_id
    AND apt2.created_at >= NOW() - (days_back || ' days')::INTERVAL
  WHERE apt.created_at >= NOW() - (days_back || ' days')::INTERVAL
  GROUP BY ap.id, ap.name, ap.email, apt.status, apt.created_at
  HAVING COUNT(apt2.id) > 0
  ORDER BY apt.created_at DESC;
$$;