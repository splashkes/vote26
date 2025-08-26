-- Create comprehensive auction export function for CSV generation
-- Combines all auction data: artworks, artists, buyers, payments, bids, Stripe metadata

CREATE OR REPLACE FUNCTION get_comprehensive_auction_export(p_event_id UUID)
RETURNS TABLE(
  -- Artwork info
  art_code TEXT,
  round INTEGER,
  easel INTEGER,
  artwork_status TEXT,
  current_bid NUMERIC,
  auction_extended BOOLEAN,
  extension_count INTEGER,
  closing_time TIMESTAMPTZ,
  
  -- Artist info
  artist_name TEXT,
  artist_entry_id TEXT,
  artist_email TEXT,
  artist_phone TEXT,
  artist_profile_phone TEXT,
  
  -- Bidding info
  winning_bid NUMERIC,
  bid_count BIGINT,
  
  -- Buyer info
  buyer_first_name TEXT,
  buyer_last_name TEXT,
  buyer_nickname TEXT,
  buyer_email TEXT,
  buyer_phone TEXT,
  buyer_auth_phone TEXT,
  
  -- Payment info
  payment_status_description TEXT,
  payment_method TEXT,
  payment_date TIMESTAMPTZ,
  admin_marked_by TEXT,
  actual_amount_collected NUMERIC,
  actual_tax_collected NUMERIC,
  collection_notes TEXT,
  
  -- Stripe metadata
  stripe_session_id TEXT,
  stripe_payment_intent TEXT,
  stripe_customer_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    -- Artwork info
    a.art_code::TEXT,
    a.round,
    a.easel,
    a.status::TEXT as artwork_status,
    a.current_bid,
    COALESCE(a.auction_extended, false) as auction_extended,
    COALESCE(a.extension_count, 0) as extension_count,
    a.closing_time,
    
    -- Artist info
    COALESCE(ap.name, u_artist.raw_user_meta_data->>'name')::TEXT as artist_name,
    ap.entry_id::TEXT as artist_entry_id,
    COALESCE(ap.email, u_artist.email)::TEXT as artist_email,
    ap.phone::TEXT as artist_phone,
    p_artist.phone_number::TEXT as artist_profile_phone,
    
    -- Bidding info  
    COALESCE(bid_summary.highest_bid, a.current_bid, 0) as winning_bid,
    COALESCE(bid_summary.bid_count, 0) as bid_count,
    
    -- Buyer info (from highest bidder)
    p_buyer.first_name::TEXT as buyer_first_name,
    p_buyer.last_name::TEXT as buyer_last_name,
    p_buyer.nickname::TEXT as buyer_nickname,
    COALESCE(p_buyer.email, u_buyer.email)::TEXT as buyer_email,
    p_buyer.phone_number::TEXT as buyer_phone,
    p_buyer.auth_phone::TEXT as buyer_auth_phone,
    
    -- Payment info
    ps.description::TEXT as payment_status_description,
    pl.payment_method::TEXT,
    COALESCE(pl.created_at, a.buyer_pay_recent_date) as payment_date,
    pl.admin_phone::TEXT as admin_marked_by,
    pl.actual_amount_collected,
    pl.actual_tax_collected,
    pl.collection_notes::TEXT,
    
    -- Stripe metadata (from payment logs metadata or bid metadata)
    COALESCE(
      pl.metadata->>'stripe_session_id',
      bid_summary.stripe_session_id
    )::TEXT as stripe_session_id,
    COALESCE(
      pl.metadata->>'stripe_payment_intent',
      bid_summary.stripe_payment_intent  
    )::TEXT as stripe_payment_intent,
    COALESCE(
      pl.metadata->>'stripe_customer_id',
      bid_summary.stripe_customer_id
    )::TEXT as stripe_customer_id
    
  FROM art a
  
  -- Artist data
  LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
  LEFT JOIN people p_artist ON ap.person_id = p_artist.id
  LEFT JOIN auth.users u_artist ON p_artist.id = u_artist.id
  
  -- Bidding summary (get highest bid and metadata)
  LEFT JOIN (
    SELECT DISTINCT ON (b.art_id)
      b.art_id,
      MAX(b.amount) OVER (PARTITION BY b.art_id) as highest_bid,
      COUNT(*) OVER (PARTITION BY b.art_id) as bid_count,
      FIRST_VALUE(b.person_id) OVER (PARTITION BY b.art_id ORDER BY b.amount DESC, b.created_at DESC) as highest_bidder_id,
      NULL::TEXT as stripe_session_id,
      NULL::TEXT as stripe_payment_intent, 
      NULL::TEXT as stripe_customer_id
    FROM bids b
    WHERE b.art_id IN (SELECT id FROM art WHERE event_id = p_event_id)
  ) bid_summary ON a.id = bid_summary.art_id
  
  -- Buyer data (from highest bidder)
  LEFT JOIN people p_buyer ON bid_summary.highest_bidder_id = p_buyer.id  
  LEFT JOIN auth.users u_buyer ON p_buyer.id = u_buyer.id
  
  -- Payment status
  LEFT JOIN payment_statuses ps ON a.buyer_pay_recent_status_id = ps.id
  
  -- Payment logs (for admin payments)
  LEFT JOIN payment_logs pl ON a.id = pl.art_id AND pl.payment_type = 'admin_marked'
  
  WHERE a.event_id = p_event_id
  ORDER BY a.art_code;
  
END;
$$;