-- Fix art_status enum to include all needed statuses

-- First, let's check current enum values and add missing ones
DO $$
BEGIN
  -- Add 'closed' status (2) if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'closed' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'art_status')
  ) THEN
    ALTER TYPE art_status ADD VALUE 'closed' AFTER 'active';
  END IF;
  
  -- Add 'paid' status (4) if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'paid' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'art_status')
  ) THEN
    ALTER TYPE art_status ADD VALUE 'paid' AFTER 'cancelled';
  END IF;
END $$;

-- Update the check_and_close_expired_auctions function to use numeric status
CREATE OR REPLACE FUNCTION check_and_close_expired_auctions()
RETURNS TABLE(
  closed_with_bids INTEGER,
  closed_no_bids INTEGER,
  notifications_queued INTEGER
) AS $$
DECLARE
  v_art RECORD;
  v_closed_with_bids INTEGER := 0;
  v_closed_no_bids INTEGER := 0;
  v_notifications INTEGER := 0;
  v_winner RECORD;
  v_channel_id VARCHAR;
BEGIN
  -- Find all artworks that should be closed WITH BIDS
  FOR v_art IN
    SELECT a.*, e.currency, e.tax, e.id as event_id
    FROM art a
    JOIN events e ON a.event_id = e.id
    WHERE a.status = 'active'  -- status 1
      AND a.closing_time IS NOT NULL
      AND a.closing_time < NOW()
      AND a.current_bid > 0
  LOOP
    -- Update status to closed (2)
    UPDATE art
    SET 
      status = 'closed',
      mongo_status = 2,
      updated_at = NOW()
    WHERE id = v_art.id;
    
    v_closed_with_bids := v_closed_with_bids + 1;
    
    -- Get winner information
    SELECT p.*, b.amount
    INTO v_winner
    FROM bids b
    JOIN people p ON b.person_id = p.id
    WHERE b.art_id = v_art.id
    ORDER BY b.amount DESC
    LIMIT 1;
    
    -- Update winner_id
    UPDATE art
    SET winner_id = v_winner.id
    WHERE id = v_art.id;
    
    -- Queue winner SMS notification
    IF v_winner.phone_number IS NOT NULL THEN
      INSERT INTO message_queue (
        channel,
        destination,
        message_body,
        metadata,
        status,
        priority,
        send_after,
        send_immediately
      ) VALUES (
        'sms',
        v_winner.phone_number,
        format('You have won %s by %s for %s%s. Please complete your payment at https://artb.art/pay/%s',
          v_art.art_code,
          COALESCE(v_art.artist_name, 'Artist'),
          COALESCE(v_art.currency, '$'),
          v_winner.amount,
          v_art.art_code
        ),
        jsonb_build_object(
          'type', 'auction_winner',
          'art_id', v_art.id,
          'art_code', v_art.art_code,
          'amount', v_winner.amount,
          'winner_id', v_winner.id
        ),
        'pending',
        1, -- high priority
        NOW(),
        true -- send immediately
      );
      
      v_notifications := v_notifications + 1;
    END IF;
  END LOOP;
  
  -- Handle artworks with NO BIDS (stale lots)
  FOR v_art IN
    SELECT a.*, e.id as event_id
    FROM art a
    JOIN events e ON a.event_id = e.id
    WHERE a.status = 'active'  -- status 1
      AND a.closing_time IS NOT NULL
      AND a.closing_time < NOW()
      AND (a.current_bid IS NULL OR a.current_bid = 0)
  LOOP
    -- Update status to closed
    UPDATE art
    SET 
      status = 'closed',
      mongo_status = 2,
      updated_at = NOW()
    WHERE id = v_art.id;
    
    v_closed_no_bids := v_closed_no_bids + 1;
  END LOOP;
  
  RETURN QUERY SELECT v_closed_with_bids, v_closed_no_bids, v_notifications;
END;
$$ LANGUAGE plpgsql;

-- Function to mark artwork as paid
CREATE OR REPLACE FUNCTION mark_artwork_paid(
  p_art_id UUID,
  p_payment_reference TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE art
  SET 
    status = 'paid',
    mongo_status = 4,
    updated_at = NOW()
  WHERE id = p_art_id
    AND status = 'closed';
    
  IF FOUND THEN
    -- Log payment status
    INSERT INTO payment_logs (
      art_id,
      amount,
      status,
      reference,
      created_at
    ) 
    SELECT 
      p_art_id,
      current_bid,
      'completed',
      p_payment_reference,
      NOW()
    FROM art
    WHERE id = p_art_id;
    
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Grant permission
GRANT EXECUTE ON FUNCTION mark_artwork_paid(UUID, TEXT) TO authenticated;