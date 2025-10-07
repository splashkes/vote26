-- Create function to get artist balance for a specific currency
-- CRITICAL: Prevents overpayment bug where total balance across all currencies was being paid in one currency

CREATE OR REPLACE FUNCTION get_artist_balance_for_currency(
  p_artist_profile_id UUID,
  p_currency TEXT
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_earnings NUMERIC := 0;
  v_payments NUMERIC := 0;
  v_balance NUMERIC := 0;
BEGIN
  -- Calculate earnings in the specified currency
  SELECT COALESCE(SUM(COALESCE(a.final_price, a.current_bid, 0) * e.artist_auction_portion), 0)
  INTO v_earnings
  FROM art a
  JOIN events e ON a.event_id = e.id
  WHERE a.artist_id = p_artist_profile_id
    AND a.status IN ('sold', 'paid')
    AND e.currency = p_currency
    AND COALESCE(a.final_price, a.current_bid, 0) > 0;

  -- Calculate payments made in the specified currency
  SELECT COALESCE(SUM(gross_amount), 0)
  INTO v_payments
  FROM artist_payments
  WHERE artist_profile_id = p_artist_profile_id
    AND currency = p_currency
    AND status IN ('paid', 'verified', 'processing', 'pending')
    AND status != 'cancelled';

  -- Calculate net balance
  v_balance := v_earnings - v_payments;

  -- Return balance (zero if negative)
  RETURN GREATEST(0, v_balance);
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION get_artist_balance_for_currency(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_artist_balance_for_currency(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_artist_balance_for_currency(UUID, TEXT) TO anon;

COMMENT ON FUNCTION get_artist_balance_for_currency(UUID, TEXT) IS
'Returns the artist balance owed for a SPECIFIC currency only. Critical for preventing overpayment when artists have earnings in multiple currencies.';
