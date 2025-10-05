-- Create function to get overdue artist payments
-- Used by Event Linter Rule #14

CREATE OR REPLACE FUNCTION get_overdue_artist_payments(days_threshold INTEGER DEFAULT 14)
RETURNS TABLE(
  artist_id UUID,
  artist_name TEXT,
  artist_email TEXT,
  artist_phone TEXT,
  artist_entry_id INTEGER,
  balance_owed NUMERIC,
  currency TEXT,
  days_overdue INTEGER,
  reference_date TIMESTAMPTZ,
  payment_account_status TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.artist_id,
    a.artist_name,
    a.artist_email,
    a.artist_phone,
    a.artist_entry_id,
    a.estimated_balance as balance_owed,
    a.balance_currency as currency,
    EXTRACT(DAY FROM (NOW() - ref.ref_date))::INTEGER as days_overdue,
    ref.ref_date as reference_date,
    a.payment_account_status
  FROM get_artists_owed() a
  CROSS JOIN LATERAL (
    SELECT COALESCE(
      MAX(art.buyer_pay_recent_date),
      MAX(e.event_end_datetime)
    ) as ref_date
    FROM art
    JOIN events e ON art.event_id = e.id
    WHERE art.artist_id = a.artist_id
      AND art.status IN ('sold', 'paid')
  ) ref
  WHERE ref.ref_date < NOW() - (days_threshold || ' days')::INTERVAL
    AND a.estimated_balance > 0.01
  ORDER BY days_overdue DESC;
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION get_overdue_artist_payments(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION get_overdue_artist_payments(INTEGER) TO authenticated;

COMMENT ON FUNCTION get_overdue_artist_payments(INTEGER) IS 'Returns artists with payments overdue beyond specified days threshold. Uses buyer payment date or event end date as reference.';
