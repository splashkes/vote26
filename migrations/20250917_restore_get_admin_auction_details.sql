-- Restore get_admin_auction_details function with JWT admin authentication
-- This function was removed during security enhancements but is needed for auction CSV export

CREATE OR REPLACE FUNCTION public.get_admin_auction_details(
  p_event_id uuid,
  p_admin_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
  v_user_phone text;
  v_admin_events jsonb;
  v_user_claims jsonb;
  v_is_admin boolean := false;
  v_result jsonb := '{"success": false}'::jsonb;
  v_bids jsonb := '{}'::jsonb;
  v_art_record RECORD;
  v_highest_bid RECORD;
  v_bid_data jsonb;
BEGIN
  -- Get current authenticated user
  v_user_id := auth.uid();

  -- If no authenticated user, reject immediately
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Authentication required'
    );
  END IF;

  -- Get user claims from JWT token
  SELECT auth.jwt() -> 'app_metadata' INTO v_user_claims;

  -- Extract admin_events claim
  v_admin_events := v_user_claims -> 'admin_events';

  -- Check if user has admin access to this event
  -- First get the event EID to check against admin_events claim
  IF v_admin_events IS NOT NULL THEN
    -- Get event EID for this event_id
    DECLARE
      v_event_eid text;
    BEGIN
      SELECT eid INTO v_event_eid FROM events WHERE id = p_event_id;

      -- Check if user is admin for this specific event or has global admin access
      IF v_admin_events ? v_event_eid OR v_admin_events ? 'global' THEN
        v_is_admin := true;
      END IF;
    END;
  END IF;

  -- Special case: allow service role access (for edge functions)
  IF p_admin_phone = 'service-role' THEN
    v_is_admin := true;
  END IF;

  -- Reject if not admin
  IF NOT v_is_admin THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Admin access required for this event'
    );
  END IF;

  -- Get auction details for each artwork in the event
  FOR v_art_record IN
    SELECT
      a.id,
      a.art_code,
      a.current_bid,
      a.status
    FROM art a
    WHERE a.event_id = p_event_id
    ORDER BY a.art_code
  LOOP
    -- Get highest bidder for this artwork
    SELECT
      b.id as bid_id,
      b.amount,
      b.created_at as bid_time,
      p.id as person_id,
      p.first_name,
      p.last_name,
      p.nickname,
      COALESCE(p.email, u.email) as email,
      COALESCE(p.phone_number, u.phone) as phone_number,
      u.phone as auth_phone
    INTO v_highest_bid
    FROM bids b
    INNER JOIN people p ON b.person_id = p.id
    LEFT JOIN auth.users u ON p.auth_user_id = u.id
    WHERE b.art_id = v_art_record.id
    ORDER BY b.amount DESC, b.created_at DESC
    LIMIT 1;

    -- Build bid data for this artwork
    IF v_highest_bid.bid_id IS NOT NULL THEN
      v_bid_data := jsonb_build_object(
        'artCode', v_art_record.art_code,
        'currentBid', v_art_record.current_bid,
        'status', v_art_record.status,
        'highestBidder', jsonb_build_object(
          'person_id', v_highest_bid.person_id,
          'first_name', v_highest_bid.first_name,
          'last_name', v_highest_bid.last_name,
          'nickname', v_highest_bid.nickname,
          'email', v_highest_bid.email,
          'phone_number', v_highest_bid.phone_number,
          'auth_phone', v_highest_bid.auth_phone
        ),
        'winningBid', v_highest_bid.amount,
        'bidTime', v_highest_bid.bid_time
      );
    ELSE
      -- No bids for this artwork
      v_bid_data := jsonb_build_object(
        'artCode', v_art_record.art_code,
        'currentBid', v_art_record.current_bid,
        'status', v_art_record.status,
        'highestBidder', null,
        'winningBid', 0,
        'bidTime', null
      );
    END IF;

    -- Add to bids object using art_id as key (string for JSON compatibility)
    v_bids := v_bids || jsonb_build_object(v_art_record.id::text, v_bid_data);
  END LOOP;

  -- Return success with bid data
  RETURN jsonb_build_object(
    'success', true,
    'bids', v_bids,
    'event_id', p_event_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'sqlstate', SQLSTATE
    );
END;
$$;

-- Grant appropriate permissions
GRANT EXECUTE ON FUNCTION public.get_admin_auction_details(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_auction_details(uuid, text) TO service_role;

-- Add comment for documentation
COMMENT ON FUNCTION public.get_admin_auction_details(uuid, text) IS
'Admin function to get auction details including highest bidder info for each artwork in an event. Requires JWT admin_events claim for the specific event.';