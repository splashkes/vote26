-- Enhanced Slack channel resolution with API lookup and caching

-- Function to resolve channel name to ID with caching
CREATE OR REPLACE FUNCTION resolve_slack_channel(p_channel VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
  v_channel_id VARCHAR;
  v_clean_channel VARCHAR;
BEGIN
  -- If it already looks like a channel ID (starts with C, G, or D), return as-is
  IF p_channel ~ '^[CGD][0-9A-Z]+$' THEN
    RETURN p_channel;
  END IF;
  
  -- Clean the channel name
  v_clean_channel := LTRIM(p_channel, '#');
  
  -- Look up the channel ID from cache
  SELECT channel_id INTO v_channel_id
  FROM slack_channels
  WHERE channel_name = v_clean_channel
    AND active = true
    -- Only use entries that look like real Slack IDs
    AND channel_id ~ '^[CGD][0-9A-Z]{8,}$'
  LIMIT 1;
  
  -- Return the ID if found, otherwise return NULL to trigger API lookup
  RETURN v_channel_id;
END;
$$ LANGUAGE plpgsql;

-- Function to store channel lookup result
CREATE OR REPLACE FUNCTION cache_slack_channel(
  p_channel_name VARCHAR,
  p_channel_id VARCHAR
) RETURNS VOID AS $$
BEGIN
  -- Clean the channel name
  p_channel_name := LTRIM(p_channel_name, '#');
  
  -- Insert or update the mapping
  INSERT INTO slack_channels (channel_name, channel_id, updated_at)
  VALUES (p_channel_name, p_channel_id, NOW())
  ON CONFLICT (channel_name) 
  DO UPDATE SET 
    channel_id = EXCLUDED.channel_id,
    updated_at = NOW(),
    active = true;
END;
$$ LANGUAGE plpgsql;

-- Function to queue notification with automatic channel resolution
CREATE OR REPLACE FUNCTION queue_notification_with_lookup(
  p_event_id UUID,
  p_channel_name VARCHAR,
  p_message_type VARCHAR,
  p_payload JSONB
) RETURNS UUID AS $$
DECLARE
  v_channel_id VARCHAR;
  v_notification_id UUID;
  v_clean_channel VARCHAR;
BEGIN
  -- Clean channel name
  v_clean_channel := LTRIM(p_channel_name, '#');
  
  -- Try to resolve channel ID from cache
  v_channel_id := resolve_slack_channel(p_channel_name);
  
  -- If not found in cache, queue for lookup
  IF v_channel_id IS NULL THEN
    -- Insert notification with channel name for later resolution
    INSERT INTO slack_notifications (
      event_id,
      channel_id,
      message_type,
      payload,
      status
    ) VALUES (
      p_event_id,
      NULL, -- No ID yet
      p_message_type,
      p_payload || jsonb_build_object(
        'channel_name', v_clean_channel,
        'needs_channel_lookup', true
      ),
      'pending_lookup' -- New status for notifications needing channel lookup
    ) RETURNING id INTO v_notification_id;
  ELSE
    -- Insert notification with resolved channel ID
    INSERT INTO slack_notifications (
      event_id,
      channel_id,
      message_type,
      payload
    ) VALUES (
      p_event_id,
      v_channel_id,
      p_message_type,
      p_payload
    ) RETURNING id INTO v_notification_id;
  END IF;
  
  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql;

-- Add new status for notifications pending channel lookup
ALTER TABLE slack_notifications 
ADD CONSTRAINT check_status 
CHECK (status IN ('pending', 'pending_lookup', 'sent', 'failed'));

-- Function to process notifications needing channel lookup
CREATE OR REPLACE FUNCTION process_channel_lookups()
RETURNS TABLE(
  notification_id UUID,
  channel_name VARCHAR,
  lookup_needed BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    id,
    payload->>'channel_name',
    true
  FROM slack_notifications
  WHERE status = 'pending_lookup'
    AND payload ? 'channel_name'
  LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- Function to update notification after channel lookup
CREATE OR REPLACE FUNCTION update_notification_channel(
  p_notification_id UUID,
  p_channel_id VARCHAR
) RETURNS VOID AS $$
BEGIN
  UPDATE slack_notifications
  SET 
    channel_id = p_channel_id,
    status = 'pending',
    payload = payload - 'needs_channel_lookup' - 'channel_name'
  WHERE id = p_notification_id;
END;
$$ LANGUAGE plpgsql;

-- Update existing notification functions to use the new system
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
  v_channel := COALESCE(
    v_event_settings.channel_name, 
    v_event_settings.channel_id,
    v_event_settings.slack_channel
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
      PERFORM queue_notification_with_lookup(
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
      PERFORM queue_notification_with_lookup(
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

-- Create a view to see channel resolution status
CREATE OR REPLACE VIEW v_channel_resolution_status AS
SELECT 
  e.eid,
  e.name as event_name,
  e.slack_channel as event_channel,
  es.channel_name as settings_channel_name,
  es.channel_id as settings_channel_id,
  sc.channel_id as cached_channel_id,
  CASE 
    WHEN sc.channel_id ~ '^[CGD][0-9A-Z]{8,}$' THEN 'Resolved'
    WHEN sc.channel_id IS NOT NULL THEN 'Invalid format'
    ELSE 'Not cached'
  END as status
FROM events e
LEFT JOIN event_slack_settings es ON es.event_id = e.id
LEFT JOIN slack_channels sc ON sc.channel_name = COALESCE(
  LTRIM(es.channel_name, '#'),
  LTRIM(e.slack_channel, '#')
)
WHERE e.event_start_datetime >= NOW() - INTERVAL '3 months'
  AND (e.slack_channel IS NOT NULL OR es.channel_name IS NOT NULL)
ORDER BY e.event_start_datetime DESC;

-- Grant permissions
GRANT EXECUTE ON FUNCTION cache_slack_channel(VARCHAR, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION queue_notification_with_lookup(UUID, VARCHAR, VARCHAR, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION process_channel_lookups() TO authenticated;
GRANT EXECUTE ON FUNCTION update_notification_channel(UUID, VARCHAR) TO authenticated;
GRANT SELECT ON v_channel_resolution_status TO authenticated;