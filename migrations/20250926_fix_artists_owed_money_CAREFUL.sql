-- CRITICAL FIX: get_artists_owed_money function
-- ONLY changing hardcoded 0.5 to dynamic artist_auction_portion
-- Preserving ALL other business logic exactly as is

DROP FUNCTION IF EXISTS get_artists_owed_money();

CREATE OR REPLACE FUNCTION get_artists_owed_money()
RETURNS TABLE (
  artist_id UUID,
  artist_name TEXT,
  artist_email TEXT,
  artist_phone TEXT,
  artist_entry_id INTEGER,
  artist_country TEXT,
  estimated_balance NUMERIC
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH art_sales AS (
    SELECT
      ap.id as artist_id,
      -- ONLY CHANGE: hardcoded 0.5 → dynamic e.artist_auction_portion
      -- Added JOIN with events to get artist_auction_portion
      SUM(COALESCE(a.final_price, a.current_bid, 0) * e.artist_auction_portion) as sales_total
    FROM art a
    JOIN artist_profiles ap ON a.artist_id = ap.id
    JOIN events e ON a.event_id = e.id  -- ADDED: to get artist_auction_portion
    WHERE a.status IN ('sold', 'paid', 'closed')  -- UNCHANGED
      AND COALESCE(a.final_price, a.current_bid, 0) > 0  -- UNCHANGED
    GROUP BY ap.id  -- UNCHANGED
  ),
  payment_debits AS (
    -- UNCHANGED: Exact same payment debit logic
    SELECT
      ap.artist_profile_id,
      SUM(ap.gross_amount) as debits_total
    FROM artist_payments ap
    WHERE ap.status IN ('completed', 'paid')  -- UNCHANGED
    GROUP BY ap.artist_profile_id  -- UNCHANGED
  )
  SELECT
    -- UNCHANGED: Exact same return structure and logic
    ap.id::UUID,
    ap.name::TEXT,
    ap.email::TEXT,
    ap.phone::TEXT,
    ap.entry_id::INTEGER,
    ap.country::TEXT,
    GREATEST(0, COALESCE(asales.sales_total, 0) - COALESCE(pd.debits_total, 0))::NUMERIC
  FROM artist_profiles ap
  LEFT JOIN art_sales asales ON ap.id = asales.artist_id  -- UNCHANGED
  LEFT JOIN payment_debits pd ON ap.id = pd.artist_profile_id  -- UNCHANGED
  WHERE GREATEST(0, COALESCE(asales.sales_total, 0) - COALESCE(pd.debits_total, 0)) > 0.01  -- UNCHANGED
  ORDER BY estimated_balance DESC;  -- UNCHANGED
END;
$$;

COMMENT ON FUNCTION get_artists_owed_money() IS 'CRITICAL FIX: Changed hardcoded 0.5 to dynamic artist_auction_portion. All other logic preserved exactly.';

-- Test the fix with Tetiana to verify it now shows correct amount
SELECT 'Testing get_artists_owed_money fix...' as status;
SELECT artist_name, artist_entry_id, estimated_balance
FROM get_artists_owed_money()
WHERE artist_entry_id = 164713;