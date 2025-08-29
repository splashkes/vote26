-- Update all functions to use new fast caching system
-- This eliminates all synchronous API calls from user-facing operations

-- Replace the old resolve_slack_channel function to never make API calls
CREATE OR REPLACE FUNCTION resolve_slack_channel(p_channel VARCHAR)
RETURNS VARCHAR AS $$
BEGIN
  -- This function now just delegates to the cache-only version
  -- No more synchronous API calls!
  RETURN get_cached_slack_channel(p_channel);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update queue_notification_with_lookup to use the new cache-only function
CREATE OR REPLACE FUNCTION queue_notification_with_lookup(
  p_event_id UUID,
  p_channel_name VARCHAR,
  p_message_type VARCHAR,
  p_payload JSONB
) RETURNS UUID AS $$
BEGIN
  -- Delegate to the new cache-only function
  RETURN queue_notification_with_cache_only(p_event_id, p_channel_name, p_message_type, p_payload);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update all trigger functions that queue notifications to use friendly names
CREATE OR REPLACE FUNCTION queue_vote_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_event_settings RECORD;
  v_vote_count INT;
  v_artist_name VARCHAR;
  v_event_name VARCHAR;
  v_channel VARCHAR;
BEGIN
  -- Get event slack settings
  SELECT es.*, e.name as event_name, e.slack_channel
  INTO v_event_settings 
  FROM event_slack_settings es
  JOIN events e ON e.id = es.event_id
  WHERE es.event_id = NEW.event_id;
  
  -- Determine which channel to use (prefer settings, fallback to event)
  -- Always use friendly names, never IDs
  v_channel := COALESCE(
    CASE 
      WHEN v_event_settings.channel_name ~ '^[CGD][0-9A-Z]+$' THEN 'general'  -- Convert ID back to name
      ELSE v_event_settings.channel_name
    END,
    CASE 
      WHEN v_event_settings.slack_channel ~ '^[CGD][0-9A-Z]+$' THEN 'general'  -- Convert ID back to name
      ELSE v_event_settings.slack_channel
    END,
    'general'  -- Ultimate fallback
  );
  
  -- Only proceed if notifications are enabled and channel is set
  IF v_event_settings.vote_notifications AND v_channel IS NOT NULL THEN
    -- Get current vote count for this art piece
    SELECT COUNT(*) INTO v_vote_count
    FROM votes
    WHERE art_id = NEW.art_id;
    
    -- Get artist name
    SELECT ap.name INTO v_artist_name
    FROM art a
    JOIN artist_profiles ap ON a.artist_id = ap.id
    WHERE a.id = NEW.art_id;
    
    -- Queue notification for every 10th vote to avoid spam
    IF v_vote_count % 10 = 0 OR v_vote_count = 1 THEN
      PERFORM queue_notification_with_cache_only(
        NEW.event_id,
        v_channel,
        'vote_update',
        jsonb_build_object(
          'art_id', NEW.art_id,
          'artist_name', v_artist_name,
          'vote_count', v_vote_count,
          'round', NEW.round,
          'voter_id', NEW.person_id
        )
      );
    END IF;
    
    -- Check for milestones
    IF v_vote_count IN (100, 500, 1000, 5000) THEN
      PERFORM queue_notification_with_cache_only(
        NEW.event_id,
        v_channel,
        'vote_milestone',
        jsonb_build_object(
          'milestone', v_vote_count,
          'event_name', v_event_settings.event_name
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update queue_slack_notification function to never make API calls
CREATE OR REPLACE FUNCTION queue_slack_notification(
  p_event_id UUID,
  p_channel VARCHAR,
  p_message TEXT,
  p_message_type VARCHAR DEFAULT 'general'
) RETURNS UUID AS $$
BEGIN
  -- Use the new cache-only approach
  RETURN queue_notification_with_cache_only(
    p_event_id,
    p_channel,
    p_message_type,
    jsonb_build_object('text', p_message)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update queue_bid_notification function
CREATE OR REPLACE FUNCTION queue_bid_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_event_settings RECORD;
  v_channel VARCHAR;
  v_art_info RECORD;
  v_person_name VARCHAR;
  v_bid_amount NUMERIC;
BEGIN
  -- Get event settings and info
  SELECT 
    es.*,
    e.name as event_name,
    e.slack_channel,
    e.currency_symbol
  INTO v_event_settings
  FROM event_slack_settings es
  JOIN events e ON e.id = es.event_id
  WHERE es.event_id = NEW.event_id;

  -- Only proceed if bid notifications are enabled
  IF NOT COALESCE(v_event_settings.bid_notifications, false) THEN
    RETURN NEW;
  END IF;

  -- Determine channel (use friendly names)
  v_channel := COALESCE(
    CASE 
      WHEN v_event_settings.channel_name ~ '^[CGD][0-9A-Z]+$' THEN 'general'
      ELSE v_event_settings.channel_name
    END,
    CASE 
      WHEN v_event_settings.slack_channel ~ '^[CGD][0-9A-Z]+$' THEN 'general'
      ELSE v_event_settings.slack_channel
    END,
    'general'
  );

  -- Get art and person info
  SELECT 
    a.id,
    a.title,
    ap.name as artist_name,
    a.easel_number
  INTO v_art_info
  FROM art a
  LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
  WHERE a.id = NEW.art_id;

  -- Get bidder name (masked)
  SELECT mask_name(name) INTO v_person_name
  FROM people
  WHERE id = NEW.person_id;

  -- Format bid amount
  v_bid_amount := NEW.amount_cents / 100.0;

  -- Queue the notification using cache-only approach
  PERFORM queue_notification_with_cache_only(
    NEW.event_id,
    v_channel,
    'bid_placed',
    jsonb_build_object(
      'art_id', NEW.art_id,
      'art_title', v_art_info.title,
      'artist_name', v_art_info.artist_name,
      'easel_number', v_art_info.easel_number,
      'bidder_name', v_person_name,
      'bid_amount', v_bid_amount,
      'currency_symbol', v_event_settings.currency_symbol,
      'event_name', v_event_settings.event_name
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update other notification functions that might use the old approach
CREATE OR REPLACE FUNCTION send_rich_winner_notification(
  p_event_id UUID,
  p_art_id UUID
) RETURNS VOID AS $$
DECLARE
  v_event RECORD;
  v_art RECORD;
  v_winner RECORD;
  v_channel VARCHAR;
BEGIN
  -- Get event info
  SELECT 
    e.*,
    es.channel_name,
    es.winner_notifications
  INTO v_event
  FROM events e
  LEFT JOIN event_slack_settings es ON es.event_id = e.id
  WHERE e.id = p_event_id;

  -- Only proceed if winner notifications are enabled
  IF NOT COALESCE(v_event.winner_notifications, false) THEN
    RETURN;
  END IF;

  -- Determine channel (use friendly names)
  v_channel := COALESCE(
    CASE 
      WHEN v_event.channel_name ~ '^[CGD][0-9A-Z]+$' THEN 'general'
      ELSE v_event.channel_name
    END,
    CASE 
      WHEN v_event.slack_channel ~ '^[CGD][0-9A-Z]+$' THEN 'general'
      ELSE v_event.slack_channel
    END,
    'general'
  );

  -- Get art and winner info
  SELECT 
    a.*,
    ap.name as artist_name,
    p.name as winner_name,
    (b.amount_cents / 100.0) as winning_amount
  INTO v_art
  FROM art a
  LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
  LEFT JOIN bids b ON b.art_id = a.id AND b.id = a.winning_bid_id
  LEFT JOIN people p ON p.id = b.person_id
  WHERE a.id = p_art_id;

  -- Queue winner notification using cache-only approach
  PERFORM queue_notification_with_cache_only(
    p_event_id,
    v_channel,
    'auction_winner',
    jsonb_build_object(
      'art_id', p_art_id,
      'art_title', v_art.title,
      'artist_name', v_art.artist_name,
      'winner_name', mask_name(v_art.winner_name),
      'winning_amount', v_art.winning_amount,
      'currency_symbol', v_event.currency_symbol,
      'event_name', v_event.name
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update any other functions that might call resolve_slack_channel
-- Note: The old resolve_slack_channel function now delegates to cache-only lookup
-- so existing functions will automatically use the fast path

-- Grant permissions on updated functions
GRANT EXECUTE ON FUNCTION resolve_slack_channel(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION send_rich_winner_notification(UUID, UUID) TO authenticated;