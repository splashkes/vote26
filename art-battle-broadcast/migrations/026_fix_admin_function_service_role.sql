-- Allow service role to access admin auction details function
-- This enables CSV export and other admin functions to work with service role

CREATE OR REPLACE FUNCTION get_admin_auction_details(
  p_event_id UUID,
  p_admin_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- This allows the function to bypass RLS
AS $$
DECLARE
  v_admin_level TEXT;
  v_result JSONB;
  v_artworks JSONB;
  v_bids JSONB;
BEGIN
  -- Check admin permission level
  -- Allow service role to bypass admin level check
  IF p_admin_phone = 'service-role' THEN
    v_admin_level := 'super';
  ELSE
    SELECT get_user_admin_level(p_event_id, p_admin_phone) INTO v_admin_level;
    
    -- Only producer and super admins can access full bidder info
    IF v_admin_level NOT IN ('producer', 'super') THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', 'Insufficient permissions - requires producer or super admin access',
        'admin_level', v_admin_level
      );
    END IF;
  END IF;

  -- Get artworks with full details (bypasses RLS due to SECURITY DEFINER)
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'art_code', a.art_code,
      'round', a.round,
      'easel', a.easel,
      'status', a.status,
      'starting_bid', a.starting_bid,
      'current_bid', a.current_bid,
      'bid_count', a.bid_count,
      'winner_id', a.winner_id,
      'closing_time', a.closing_time,
      'auction_extended', a.auction_extended,
      'extension_count', a.extension_count,
      'buyer_pay_recent_status_id', a.buyer_pay_recent_status_id,
      'buyer_pay_recent_date', a.buyer_pay_recent_date,
      'artist_id', a.artist_id,
      'tax', e.tax,
      'currency', e.currency,
      'artist_profiles', jsonb_build_object(
        'id', ap.id,
        'name', ap.name,
        'entry_id', ap.entry_id
      ),
      'media', COALESCE(media_agg.media_array, '[]'::jsonb),
      'payment_statuses', CASE 
        WHEN a.buyer_pay_recent_status_id IS NOT NULL THEN
          jsonb_build_object(
            'id', ps.id,
            'code', ps.code,
            'description', ps.description
          )
        ELSE NULL
      END,
      'payment_logs', COALESCE(payment_agg.payment_array, '[]'::jsonb)
    )
  ) INTO v_artworks
  FROM art a
  JOIN events e ON a.event_id = e.id
  LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
  LEFT JOIN payment_statuses ps ON a.buyer_pay_recent_status_id = ps.id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'media_files', m.media_files
      )
    ) as media_array
    FROM media m
    WHERE m.art_id = a.id
  ) media_agg ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'art_id', pl.art_id,
        'admin_phone', pl.admin_phone,
        'metadata', pl.metadata,
        'created_at', pl.created_at,
        'payment_type', pl.payment_type,
        'actual_amount_collected', pl.actual_amount_collected,
        'actual_tax_collected', pl.actual_tax_collected,
        'payment_method', pl.payment_method,
        'collection_notes', pl.collection_notes
      )
    ) as payment_array
    FROM payment_logs pl
    WHERE pl.art_id = a.id
  ) payment_agg ON true
  WHERE a.event_id = p_event_id
    AND a.status IN ('active', 'sold', 'paid', 'cancelled');

  -- Get detailed bid information with FULL bidder details (bypasses RLS)
  SELECT jsonb_object_agg(
    art_id::text,
    jsonb_build_object(
      'highestBid', highest_bid,
      'bidCount', bid_count,
      'highestBidder', highest_bidder,
      'history', bid_history
    )
  ) INTO v_bids
  FROM (
    SELECT 
      a.id as art_id,
      COALESCE(MAX(b.amount), 0) as highest_bid,
      COUNT(b.id) as bid_count,
      -- Get highest bidder with FULL details
      (
        SELECT jsonb_build_object(
          'id', p.id,
          'first_name', p.first_name,
          'last_name', p.last_name,
          'email', p.email,
          'phone_number', p.phone_number,
          'auth_phone', p.auth_phone,
          'name', p.name,
          'nickname', p.nickname,
          'city_text', p.city_text
        )
        FROM bids b2
        JOIN people p ON b2.person_id = p.id
        WHERE b2.art_id = a.id
        ORDER BY b2.amount DESC, b2.created_at DESC
        LIMIT 1
      ) as highest_bidder,
      -- Get bid history with FULL bidder details
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'amount', b3.amount,
            'created_at', b3.created_at,
            'bidder', jsonb_build_object(
              'id', p3.id,
              'first_name', p3.first_name,
              'last_name', p3.last_name,
              'email', p3.email,
              'phone_number', p3.phone_number,
              'auth_phone', p3.auth_phone,
              'name', p3.name,
              'nickname', p3.nickname,
              'city_text', p3.city_text
            )
          )
          ORDER BY b3.amount DESC, b3.created_at DESC
        )
        FROM bids b3
        JOIN people p3 ON b3.person_id = p3.id
        WHERE b3.art_id = a.id
      ) as bid_history
    FROM art a
    LEFT JOIN bids b ON a.id = b.art_id
    WHERE a.event_id = p_event_id
      AND a.status IN ('active', 'sold', 'paid', 'cancelled')
    GROUP BY a.id
  ) bid_summary;

  -- Return comprehensive admin data
  RETURN jsonb_build_object(
    'success', true,
    'admin_level', v_admin_level,
    'artworks', COALESCE(v_artworks, '[]'::jsonb),
    'bids', COALESCE(v_bids, '{}'::jsonb),
    'timestamp', EXTRACT(EPOCH FROM NOW()) * 1000
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'admin_level', v_admin_level
    );
END;
$$;