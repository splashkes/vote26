-- Create admin function to get detailed bid history with full bidder information
-- This function uses SECURITY DEFINER to bypass RLS for admin users

CREATE OR REPLACE FUNCTION get_admin_bid_history(
  p_event_id UUID,
  p_art_id UUID DEFAULT NULL
)
RETURNS TABLE(
  bid_id UUID,
  art_id UUID,
  art_code TEXT,
  amount NUMERIC,
  bid_time TIMESTAMPTZ,
  bidder_id UUID,
  bidder_first_name TEXT,
  bidder_last_name TEXT,
  bidder_nickname TEXT,
  bidder_email TEXT,
  bidder_phone TEXT,
  bidder_auth_phone TEXT,
  is_winning_bid BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id as bid_id,
    b.art_id,
    a.art_code::TEXT,
    b.amount,
    b.created_at as bid_time,
    p.id as bidder_id,
    p.first_name::TEXT as bidder_first_name,
    p.last_name::TEXT as bidder_last_name,
    p.nickname::TEXT as bidder_nickname,
    COALESCE(p.email, u.email)::TEXT as bidder_email,
    p.phone_number::TEXT as bidder_phone,
    p.auth_phone::TEXT as bidder_auth_phone,
    (b.amount = (
      SELECT MAX(b2.amount) 
      FROM bids b2 
      WHERE b2.art_id = b.art_id
    )) as is_winning_bid
    
  FROM bids b
  INNER JOIN art a ON b.art_id = a.id
  INNER JOIN people p ON b.person_id = p.id
  LEFT JOIN auth.users u ON p.id = u.id
  
  WHERE a.event_id = p_event_id
    AND (p_art_id IS NULL OR b.art_id = p_art_id)
  
  ORDER BY b.art_id, b.amount DESC, b.created_at DESC;
  
END;
$$;