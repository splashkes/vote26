-- Enhanced SMS system with support for instant and queued sending

-- 1. Update message_queue to support instant sending
ALTER TABLE message_queue 
ADD COLUMN IF NOT EXISTS send_immediately BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

-- Add index for instant messages
CREATE INDEX IF NOT EXISTS idx_message_queue_instant 
ON message_queue(send_immediately, status) 
WHERE send_immediately = true AND status = 'pending';

-- 2. Create function to send SMS instantly (bypasses queue processing delay)
CREATE OR REPLACE FUNCTION send_sms_instantly(
  p_destination TEXT,
  p_message_body TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_from_phone TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_message_id UUID;
  v_edge_function_url TEXT;
  v_service_role_key TEXT;
  v_request_id BIGINT;
BEGIN
  -- Get configuration
  SELECT value INTO v_edge_function_url
  FROM sms_config WHERE key = 'edge_function_url';
  
  SELECT value INTO v_service_role_key
  FROM sms_config WHERE key = 'service_role_key';
  
  -- Insert into queue with send_immediately flag
  v_message_id := gen_random_uuid();
  
  INSERT INTO message_queue (
    id,
    channel,
    destination,
    message_body,
    metadata,
    from_phone,
    status,
    priority,
    send_after,
    send_immediately,
    created_at
  ) VALUES (
    v_message_id,
    'sms',
    p_destination,
    p_message_body,
    p_metadata || jsonb_build_object('sent_directly', true),
    p_from_phone,
    'processing',
    1, -- high priority
    NOW(),
    true,
    NOW()
  );
  
  -- Send immediately via pg_net
  SELECT net.http_post(
    url := v_edge_function_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_service_role_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'to', p_destination,
      'from', p_from_phone,
      'body', p_message_body,
      'messageId', v_message_id
    )
  ) INTO v_request_id;
  
  -- Store request ID in metadata
  UPDATE message_queue
  SET 
    metadata = metadata || jsonb_build_object('pg_net_request_id', v_request_id),
    processing_started_at = NOW()
  WHERE id = v_message_id;
  
  RETURN v_message_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update outbid notification to send instantly
CREATE OR REPLACE FUNCTION queue_outbid_notification(
  p_user_mongo_id TEXT,
  p_person_id UUID,
  p_art_id TEXT,
  p_artist_name TEXT,
  p_amount NUMERIC,
  p_currency_symbol TEXT,
  p_outbidder_phone_last4 TEXT,
  p_event_phone_number TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_phone TEXT;
  v_vote_url TEXT;
  v_message TEXT;
  v_message_id UUID;
BEGIN
  -- Get user's phone number
  SELECT phone_number INTO v_phone
  FROM people WHERE id = p_person_id;
  
  IF v_phone IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Construct URL
  v_vote_url := format('%s/a/%s',
    COALESCE(current_setting('app.site_url', true), 'https://artb.art'),
    p_art_id
  );
  
  -- Format message
  v_message := format('OUTBID on %s by %s %s',
    p_art_id || '-' || p_artist_name,
    p_outbidder_phone_last4,
    v_vote_url
  );
  
  -- Send instantly
  v_message_id := send_sms_instantly(
    p_destination := v_phone,
    p_message_body := v_message,
    p_metadata := jsonb_build_object(
      'type', 'outbid_notification',
      'art_id', p_art_id,
      'user_id', p_user_mongo_id,
      'amount', p_amount
    ),
    p_from_phone := p_event_phone_number
  );
  
  RETURN v_message_id;
END;
$$ LANGUAGE plpgsql;

-- 4. Update bid confirmation to send instantly
CREATE OR REPLACE FUNCTION queue_bid_confirmation(
  p_user_mongo_id TEXT,
  p_person_id UUID,
  p_art_id TEXT,
  p_artist_name TEXT,
  p_amount NUMERIC,
  p_currency_symbol TEXT,
  p_user_data JSONB,
  p_event_phone_number TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_phone TEXT;
  v_nickname TEXT;
  v_hash TEXT;
  v_vote_url TEXT;
  v_message TEXT;
  v_message_id UUID;
BEGIN
  -- Extract user data
  v_phone := p_user_data->>'PhoneNumber';
  v_nickname := p_user_data->>'NickName';
  v_hash := p_user_data->>'Hash';
  
  IF v_phone IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Construct personalized URL
  v_vote_url := format('%s/a/%s/r/%s',
    COALESCE(current_setting('app.site_url', true), 'https://artb.art'),
    p_art_id,
    v_hash
  );
  
  -- Format message
  v_message := format('%s%s Bid recorded on %s by %s %s',
    p_currency_symbol,
    p_amount,
    p_art_id || '-' || p_artist_name,
    v_nickname,
    v_vote_url
  );
  
  -- Send instantly
  v_message_id := send_sms_instantly(
    p_destination := v_phone,
    p_message_body := v_message,
    p_metadata := jsonb_build_object(
      'type', 'bid_confirmation',
      'art_id', p_art_id,
      'user_id', p_user_mongo_id,
      'amount', p_amount,
      'nickname', v_nickname
    ),
    p_from_phone := p_event_phone_number
  );
  
  RETURN v_message_id;
END;
$$ LANGUAGE plpgsql;

-- 5. Update process_message_queue to skip instant messages that are already processing
CREATE OR REPLACE FUNCTION process_message_queue()
RETURNS TABLE(processed_count INT, failed_count INT) AS $$
DECLARE
  v_message RECORD;
  v_request_id BIGINT;
  v_edge_function_url TEXT;
  v_service_role_key TEXT;
  v_processed INT := 0;
  v_failed INT := 0;
  v_twilio_enabled BOOLEAN;
BEGIN
  -- Get configuration
  SELECT value::boolean INTO v_twilio_enabled
  FROM sms_config WHERE key = 'twilio_enabled';
  
  IF NOT v_twilio_enabled THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;
  
  SELECT value INTO v_edge_function_url
  FROM sms_config WHERE key = 'edge_function_url';
  
  SELECT value INTO v_service_role_key
  FROM sms_config WHERE key = 'service_role_key';
  
  -- Process pending messages (excluding instant messages already being processed)
  FOR v_message IN
    SELECT * FROM message_queue
    WHERE status = 'pending'
      AND send_after <= NOW()
      AND retry_count < 3
      AND (send_immediately = false OR processing_started_at IS NULL)
    ORDER BY priority ASC, created_at ASC
    LIMIT 10
  LOOP
    -- Send via pg_net
    SELECT net.http_post(
      url := v_edge_function_url,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_service_role_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'to', v_message.destination,
        'from', v_message.from_phone,
        'body', v_message.message_body,
        'messageId', v_message.id
      )
    ) INTO v_request_id;
    
    -- Update message status
    UPDATE message_queue
    SET 
      status = 'processing',
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('pg_net_request_id', v_request_id),
      processing_started_at = NOW(),
      last_attempt_at = NOW()
    WHERE id = v_message.id;
    
    v_processed := v_processed + 1;
  END LOOP;
  
  -- Check results from previous requests
  PERFORM check_sms_results();
  
  RETURN QUERY SELECT v_processed, v_failed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Create function for tiered auction closing notifications
CREATE OR REPLACE FUNCTION send_auction_closing_notifications()
RETURNS VOID AS $$
DECLARE
  v_event RECORD;
  v_message_id UUID;
  v_active_bidders RECORD;
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
      2, -- medium priority
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
    WITH active_bidder_arts AS (
      SELECT DISTINCT
        b.person_id,
        b.art_id,
        a.art_code,
        a.closing_time,
        ap.name as artist_name,
        e.name as event_name,
        e.phone_number as event_phone,
        -- Check if they're currently winning
        b.amount = a.current_bid as is_winning
      FROM bids b
      JOIN art a ON b.art_id = a.id
      JOIN events e ON a.event_id = e.id
      LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
      WHERE a.closing_time BETWEEN NOW() + INTERVAL '4 minutes 30 seconds' 
                               AND NOW() + INTERVAL '5 minutes 30 seconds'
        AND a.status = 'active'
        AND b.amount > 0
    )
    SELECT 
      aba.person_id,
      aba.art_id,
      aba.art_code,
      aba.artist_name,
      aba.is_winning,
      aba.event_phone,
      p.phone_number
    FROM active_bidder_arts aba
    JOIN people p ON p.id = aba.person_id
    WHERE p.phone_number IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM message_queue
        WHERE metadata->>'type' = '5min_warning'
          AND metadata->>'art_id' = aba.art_id::text
          AND metadata->>'person_id' = aba.person_id::text
          AND created_at > NOW() - INTERVAL '10 minutes'
      )
  LOOP
    -- Send personalized warning
    v_message_id := send_sms_instantly(
      p_destination := v_active_bidders.phone_number,
      p_message_body := CASE 
        WHEN v_active_bidders.is_winning THEN
          format('You are WINNING %s by %s - auction closes in 5 min! https://artb.art/bid/%s',
            v_active_bidders.art_code,
            v_active_bidders.artist_name,
            v_active_bidders.art_code
          )
        ELSE
          format('You are NOT WINNING on %s by %s. Bid again to win this work https://artb.art/bid/%s',
            v_active_bidders.art_code,
            v_active_bidders.artist_name,
            v_active_bidders.art_code
          )
      END,
      p_metadata := jsonb_build_object(
        'type', '5min_warning',
        'art_id', v_active_bidders.art_id,
        'person_id', v_active_bidders.person_id,
        'is_winning', v_active_bidders.is_winning
      ),
      p_from_phone := v_active_bidders.event_phone
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 7. Add this to the cron job that checks expired auctions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-auction-warnings') THEN
    UPDATE cron.job 
    SET schedule = '* * * * *',
        command = 'SELECT send_auction_closing_notifications();'
    WHERE jobname = 'send-auction-warnings';
  ELSE
    PERFORM cron.schedule('send-auction-warnings', '* * * * *', 'SELECT send_auction_closing_notifications();');
  END IF;
END $$;

-- 8. Create view to monitor SMS queue status
CREATE OR REPLACE VIEW v_sms_queue_status AS
SELECT 
  status,
  send_immediately,
  COUNT(*) as count,
  MIN(created_at) as oldest,
  MAX(created_at) as newest,
  AVG(retry_count) as avg_retries
FROM message_queue
WHERE channel = 'sms'
GROUP BY status, send_immediately
ORDER BY status, send_immediately;

-- 9. Grant permissions
GRANT EXECUTE ON FUNCTION send_sms_instantly TO authenticated;
GRANT EXECUTE ON FUNCTION send_auction_closing_notifications TO authenticated;
GRANT SELECT ON v_sms_queue_status TO authenticated;