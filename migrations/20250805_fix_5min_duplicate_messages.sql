-- Fix duplicate WINNING/NOT WINNING messages in 5-minute warnings

CREATE OR REPLACE FUNCTION send_auction_closing_notifications()
RETURNS VOID AS $$
DECLARE
  v_event RECORD;
  v_message_id UUID;
  v_active_bidders RECORD;
  v_top_bidder_id UUID;
  v_top_bid_amount NUMERIC;
BEGIN
  -- 10-minute general warning for registered users
  FOR v_event IN
    SELECT DISTINCT 
      e.id,
      e.name,
      e.event_code,
      e.auction_close_starts_at,
      e.phone_number
    FROM events e
    WHERE e.auction_close_starts_at IS NOT NULL
      AND e.auction_close_starts_at > NOW()
      AND e.auction_close_starts_at <= NOW() + INTERVAL '10 minutes 30 seconds'
      AND NOT EXISTS (
        SELECT 1 FROM message_queue mq
        WHERE mq.metadata->>'type' = '10min_warning'
          AND mq.metadata->>'event_id' = e.id::text
          AND mq.created_at > NOW() - INTERVAL '15 minutes'
      )
  LOOP
    INSERT INTO message_queue (
      channel,
      destination,
      message_body,
      metadata,
      status,
      priority,
      send_after,
      from_phone
    )
    SELECT 
      'sms',
      p.phone_number,
      format('%s Auction starts closing in 10 min! Bid now to secure your piece https://artb.art/bid',
        v_event.name),
      jsonb_build_object(
        'type', '10min_warning',
        'event_id', v_event.id,
        'event_name', v_event.name,
        'person_id', p.id
      ),
      'pending',
      1,
      NOW(),
      v_event.phone_number
    FROM people p
    WHERE EXISTS (
      SELECT 1 FROM registrations r 
      WHERE r.person_id = p.id 
        AND r.event_id = v_event.id
    )
    AND p.phone_number IS NOT NULL;
  END LOOP;
  
  -- 5-minute personalized warnings to active bidders only
  -- Fixed to prevent duplicate messages
  FOR v_active_bidders IN
    WITH arts_closing_soon AS (
      -- Arts closing in 5 minutes
      SELECT DISTINCT
        a.id as art_id,
        a.art_code,
        a.closing_time,
        ap.name as artist_name,
        e.name as event_name,
        e.phone_number as event_phone
      FROM art a
      JOIN events e ON a.event_id = e.id
      LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
      WHERE a.status = 'active'
        AND a.closing_time IS NOT NULL
        AND a.closing_time > NOW()
        AND a.closing_time <= NOW() + INTERVAL '5 minutes 30 seconds'
        AND NOT EXISTS (
          SELECT 1 FROM message_queue mq
          WHERE mq.metadata->>'type' = '5min_warning'
            AND mq.metadata->>'art_id' = a.id::text
            AND mq.created_at > NOW() - INTERVAL '6 minutes'
        )
    ),
    top_bidders AS (
      -- Get THE top bidder for each art
      SELECT DISTINCT ON (b.art_id)
        b.art_id,
        b.person_id as top_bidder_id,
        b.amount as top_bid_amount
      FROM bids b
      WHERE b.art_id IN (SELECT art_id FROM arts_closing_soon)
      ORDER BY b.art_id, b.amount DESC, b.created_at ASC  -- Earlier bid wins ties
    ),
    bidder_status AS (
      -- Determine each bidder's status ONCE
      SELECT DISTINCT
        b.person_id,
        b.art_id,
        acs.art_code,
        acs.artist_name,
        acs.event_name,
        acs.event_phone,
        p.phone_number,
        -- Each person gets exactly ONE status per artwork
        CASE 
          WHEN b.person_id = tb.top_bidder_id THEN true
          ELSE false
        END as is_winning
      FROM bids b
      JOIN arts_closing_soon acs ON b.art_id = acs.art_id
      JOIN people p ON b.person_id = p.id
      LEFT JOIN top_bidders tb ON tb.art_id = b.art_id
      WHERE p.phone_number IS NOT NULL
    )
    SELECT * FROM bidder_status
  LOOP
    -- Queue personalized message
    INSERT INTO message_queue (
      channel,
      destination,
      message_body,
      metadata,
      status,
      priority,
      send_after,
      send_immediately,
      from_phone
    )
    VALUES (
      'sms',
      v_active_bidders.phone_number,
      CASE 
        WHEN v_active_bidders.is_winning THEN
          format('You are WINNING %s by %s - auction closes in 5 min! https://artb.art/bid/%s',
            v_active_bidders.art_code,
            COALESCE(v_active_bidders.artist_name, 'artist'),
            v_active_bidders.art_code)
        ELSE
          format('You are NOT WINNING %s. Bid now to take it home - closes in 5 min! https://artb.art/bid/%s',
            v_active_bidders.art_code,
            v_active_bidders.art_code)
      END,
      jsonb_build_object(
        'type', '5min_warning',
        'art_id', v_active_bidders.art_id,
        'person_id', v_active_bidders.person_id,
        'is_winning', v_active_bidders.is_winning,
        'sent_directly', true
      ),
      'pending',
      1,
      NOW(),
      true, -- send immediately
      v_active_bidders.event_phone
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also ensure the from_phone is properly set in instant SMS
CREATE OR REPLACE FUNCTION send_sms_instantly(
  p_destination TEXT,
  p_message_body TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
  v_message_id UUID;
  v_from_phone TEXT;
  v_event_id UUID;
BEGIN
  -- Generate message ID
  v_message_id := gen_random_uuid();
  
  -- Try to get event phone from metadata
  v_event_id := (p_metadata->>'event_id')::UUID;
  
  -- Get from phone number - prioritize event phone
  IF v_event_id IS NOT NULL THEN
    SELECT phone_number INTO v_from_phone
    FROM events
    WHERE id = v_event_id;
  END IF;
  
  -- Fallback to default if no event phone
  IF v_from_phone IS NULL THEN
    v_from_phone := '+14163025959'; -- Default Art Battle phone
  END IF;
  
  -- Insert into message queue
  INSERT INTO message_queue (
    id,
    channel,
    destination,
    message_body,
    metadata,
    status,
    priority,
    send_after,
    send_immediately,
    from_phone,
    created_at
  ) VALUES (
    v_message_id,
    'sms',
    p_destination,
    p_message_body,
    p_metadata,
    'pending',
    1,
    NOW(),
    true,
    v_from_phone,
    NOW()
  );
  
  RETURN v_message_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;