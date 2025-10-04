-- Add manual_payment_override and has_manual_request to get_enhanced_admin_artists_owed function

DROP FUNCTION IF EXISTS get_enhanced_admin_artists_owed();

CREATE OR REPLACE FUNCTION get_enhanced_admin_artists_owed()
RETURNS TABLE(
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
  recent_contests INTEGER,
  invitation_count INTEGER,
  latest_invitation_method TEXT,
  latest_invitation_date TIMESTAMP WITH TIME ZONE,
  time_since_latest TEXT,
  onboarding_status TEXT,
  manual_payment_override BOOLEAN,
  has_manual_request BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH artists_with_sales AS (
    SELECT DISTINCT
      ap.id as artist_id,
      ap.name as artist_name,
      ap.email as artist_email,
      ap.phone as artist_phone,
      ap.entry_id as artist_entry_id,
      ap.country as artist_country,
      ap.manual_payment_override
    FROM artist_profiles ap
    JOIN art a ON ap.id = a.artist_id
    WHERE a.status IN ('sold', 'paid', 'closed')
      AND COALESCE(a.final_price, a.current_bid, 0) > 0
  ),
  artist_balances AS (
    SELECT
      aal.artist_profile_id,
      SUM(aal.amount) as balance,
      (ARRAY_AGG(aal.currency ORDER BY ABS(aal.amount) DESC))[1] as primary_currency
    FROM artist_account_ledger aal
    GROUP BY aal.artist_profile_id
    HAVING SUM(aal.amount) > 0.01
  ),
  recent_events AS (
    SELECT
      rc.artist_id,
      c.name as city_name,
      COUNT(DISTINCT e.id) as contest_count,
      ROW_NUMBER() OVER (PARTITION BY rc.artist_id ORDER BY MAX(e.event_start_datetime) DESC) as rn
    FROM round_contestants rc
    JOIN rounds r ON rc.round_id = r.id
    JOIN events e ON r.event_id = e.id
    JOIN cities c ON e.city_id = c.id
    WHERE e.event_start_datetime >= NOW() - INTERVAL '365 days'
    GROUP BY rc.artist_id, c.name
  ),
  invitation_history AS (
    SELECT
      agpi.artist_profile_id,
      COUNT(*) as invitation_count,
      MAX(agpi.created_at) as latest_invitation_date,
      (ARRAY_AGG(agpi.invitation_method ORDER BY agpi.created_at DESC))[1] as latest_invitation_method,
      CASE
        WHEN MAX(agpi.created_at) >= NOW() - INTERVAL '1 day' THEN
          EXTRACT(EPOCH FROM (NOW() - MAX(agpi.created_at)))::INTEGER || 's ago'
        WHEN MAX(agpi.created_at) >= NOW() - INTERVAL '7 days' THEN
          EXTRACT(EPOCH FROM (NOW() - MAX(agpi.created_at)))::INTEGER / 86400 || 'd ago'
        WHEN MAX(agpi.created_at) >= NOW() - INTERVAL '30 days' THEN
          EXTRACT(EPOCH FROM (NOW() - MAX(agpi.created_at)))::INTEGER / 604800 || 'w ago'
        ELSE
          EXTRACT(EPOCH FROM (NOW() - MAX(agpi.created_at)))::INTEGER / 2592000 || 'mo ago'
      END as time_since_latest
    FROM artist_global_payment_invitations agpi
    WHERE agpi.status = 'sent'
    GROUP BY agpi.artist_profile_id
  ),
  manual_requests AS (
    SELECT
      ampr.artist_profile_id,
      TRUE as has_manual_request
    FROM artist_manual_payment_requests ampr
    WHERE ampr.status = 'pending'
  )
  SELECT
    aws.artist_id,
    aws.artist_name,
    aws.artist_email,
    aws.artist_phone,
    aws.artist_entry_id,
    aws.artist_country,
    COALESCE(ab.balance, 0)::NUMERIC as estimated_balance,
    COALESCE(ab.primary_currency, 'USD')::TEXT as balance_currency,
    COALESCE(agp.status, 'no_account')::TEXT as payment_account_status,
    agp.stripe_recipient_id::TEXT,
    COALESCE(re.city_name, 'No recent events')::TEXT as recent_city,
    COALESCE(re.contest_count, 0)::INTEGER as recent_contests,
    COALESCE(ih.invitation_count, 0)::INTEGER as invitation_count,
    ih.latest_invitation_method::TEXT,
    ih.latest_invitation_date,
    ih.time_since_latest::TEXT,
    COALESCE(agp.status, 'no_account')::TEXT as onboarding_status,
    COALESCE(aws.manual_payment_override, FALSE)::BOOLEAN,
    COALESCE(mr.has_manual_request, FALSE)::BOOLEAN
  FROM artists_with_sales aws
  JOIN artist_balances ab ON aws.artist_id = ab.artist_profile_id
  LEFT JOIN artist_global_payments agp ON aws.artist_id = agp.artist_profile_id
  LEFT JOIN recent_events re ON aws.artist_id = re.artist_id AND re.rn = 1
  LEFT JOIN invitation_history ih ON aws.artist_id = ih.artist_profile_id
  LEFT JOIN manual_requests mr ON aws.artist_id = mr.artist_profile_id
  ORDER BY ab.balance DESC;
END;
$$;

COMMENT ON FUNCTION get_enhanced_admin_artists_owed IS 'Enhanced version that includes manual_payment_override and has_manual_request flags';
