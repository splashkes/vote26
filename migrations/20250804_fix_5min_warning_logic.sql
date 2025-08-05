-- Fix 5-minute warning to only send "winning" to the actual top bidder

CREATE OR REPLACE FUNCTION send_auction_closing_notifications()
RETURNS VOID AS $$
DECLARE
  v_event RECORD;
  v_message_id UUID;
  v_active_bidders RECORD;
  v_top_bidder_id UUID;
  v_top_bid_amount NUMERIC;
BEGIN
  -- 10-minute warning to all registered event attendees
  FOR v_event IN
    SELECT DISTINCT e.*, COUNT(DISTINCT b.person_id) as bidder_count
    FROM events e
    JOIN art a ON a.event_id = e.id
    LEFT JOIN bids b ON b.art_id = a.id
    WHERE e.enabled = true
      AND e.enable_auction = true
      AND EXISTS (
        SELECT 1 FROM art 
        WHERE event_id = e.id 
          AND closing_time BETWEEN NOW() + INTERVAL '9 minutes 30 seconds' 
                               AND NOW() + INTERVAL '10 minutes 30 seconds'
          AND status = 'active'
      )
      AND NOT EXISTS (
        SELECT 1 FROM message_queue
        WHERE metadata->>'type' = '10min_warning'
          AND metadata->>'event_id' = e.id::text
          AND created_at > NOW() - INTERVAL '15 minutes'
      )
    GROUP BY e.id
  LOOP
    -- Send to all registered users for this event
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
      format('Only 10 min left to bid in %s - https://artbattle.com/bid', v_event.name),
      jsonb_build_object(
        'type', '10min_warning',
        'event_id', v_event.id,
        'event_name', v_event.name
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
  FOR v_active_bidders IN
    WITH arts_closing_soon AS (
      -- First, get all arts closing in 5 minutes
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
      WHERE a.closing_time BETWEEN NOW() + INTERVAL '4 minutes 30 seconds' 
                               AND NOW() + INTERVAL '5 minutes 30 seconds'
        AND a.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM message_queue mq
          WHERE mq.metadata->>'art_id' = a.id::text
            AND mq.metadata->>'type' = '5min_warning'
            AND mq.created_at > NOW() - INTERVAL '10 minutes'
        )
    ),
    top_bidders AS (
      -- Get the actual top bidder for each art
      SELECT DISTINCT ON (b.art_id)
        b.art_id,
        b.person_id as top_bidder_id,
        b.amount as top_bid_amount
      FROM bids b
      WHERE b.art_id IN (SELECT art_id FROM arts_closing_soon)
      ORDER BY b.art_id, b.amount DESC, b.created_at DESC  -- Use created_at to break ties
    ),
    all_bidders AS (
      -- Get all bidders for these arts
      SELECT DISTINCT
        b.person_id,
        b.art_id,
        acs.art_code,
        acs.artist_name,
        acs.event_name,
        acs.event_phone,
        p.phone_number,
        -- Check if this person is THE top bidder (not just tied)
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
    SELECT * FROM all_bidders
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

-- Test by manually running it
SELECT send_auction_closing_notifications();