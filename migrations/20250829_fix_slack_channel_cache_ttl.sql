-- Fix Slack Channel Caching System with TTL
-- This migration restores proper caching to eliminate 6+ second profile update delays

-- Phase 1: Enhance slack_channels table with TTL support
ALTER TABLE slack_channels 
ADD COLUMN IF NOT EXISTS cache_expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour',
ADD COLUMN IF NOT EXISTS last_api_lookup_at TIMESTAMPTZ DEFAULT NOW();

-- Create index for efficient TTL lookups
CREATE INDEX IF NOT EXISTS idx_slack_channels_expires ON slack_channels(cache_expires_at);

-- Phase 2: Create fast cache lookup function (no API calls)
CREATE OR REPLACE FUNCTION get_cached_slack_channel(p_channel_name VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
  v_channel_id VARCHAR;
  v_clean_channel VARCHAR;
BEGIN
  -- Clean the channel name
  v_clean_channel := LTRIM(p_channel_name, '#');
  
  -- If it already looks like a channel ID (starts with C, G, or D), return as-is
  IF v_clean_channel ~ '^[CGD][0-9A-Z]+$' THEN
    RETURN v_clean_channel;
  END IF;
  
  -- Look up the channel ID from cache, only if not expired
  SELECT channel_id INTO v_channel_id
  FROM slack_channels
  WHERE channel_name = v_clean_channel
    AND active = true
    AND cache_expires_at > NOW()
    AND channel_id ~ '^[CGD][0-9A-Z]{8,}$'
  LIMIT 1;
  
  -- Return the ID if found and not expired, otherwise NULL
  RETURN v_channel_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Phase 3: Create cache update function for background processor
CREATE OR REPLACE FUNCTION update_slack_channel_cache(
  p_channel_name VARCHAR,
  p_channel_id VARCHAR,
  p_ttl_hours INTEGER DEFAULT 24
) RETURNS VOID AS $$
DECLARE
  v_clean_channel VARCHAR;
BEGIN
  -- Clean the channel name
  v_clean_channel := LTRIM(p_channel_name, '#');
  
  -- Insert or update the mapping with TTL
  INSERT INTO slack_channels (
    channel_name, 
    channel_id, 
    cache_expires_at,
    last_api_lookup_at,
    updated_at,
    active
  )
  VALUES (
    v_clean_channel, 
    p_channel_id, 
    NOW() + (p_ttl_hours || ' hours')::INTERVAL,
    NOW(),
    NOW(),
    true
  )
  ON CONFLICT (channel_name) 
  DO UPDATE SET 
    channel_id = EXCLUDED.channel_id,
    cache_expires_at = EXCLUDED.cache_expires_at,
    last_api_lookup_at = EXCLUDED.last_api_lookup_at,
    updated_at = NOW(),
    active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Phase 4: Replace queue_notification_with_lookup to never make API calls
CREATE OR REPLACE FUNCTION queue_notification_with_cache_only(
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
  
  -- Try to get channel ID from cache (fast lookup only)
  v_channel_id := get_cached_slack_channel(v_clean_channel);
  
  -- Always queue the notification - never block for API calls
  IF v_channel_id IS NOT NULL THEN
    -- Cache hit - queue with resolved channel ID for immediate processing
    INSERT INTO slack_notifications (
      event_id,
      channel_id,
      message_type,
      payload,
      status
    ) VALUES (
      p_event_id,
      v_channel_id,
      p_message_type,
      p_payload,
      'pending' -- Ready for immediate processing
    ) RETURNING id INTO v_notification_id;
  ELSE
    -- Cache miss - queue with channel name for async lookup
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
      'pending_lookup' -- Needs background processing
    ) RETURNING id INTO v_notification_id;
  END IF;
  
  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Phase 5: Improve the background processor to handle TTL
CREATE OR REPLACE FUNCTION process_slack_channel_lookups(p_limit INTEGER DEFAULT 10)
RETURNS TABLE(
  processed INTEGER,
  resolved INTEGER,
  failed INTEGER
) AS $$
DECLARE
  v_notification RECORD;
  v_processed INTEGER := 0;
  v_resolved INTEGER := 0;
  v_failed INTEGER := 0;
  v_channel_id VARCHAR;
  v_channel_name VARCHAR;
  v_slack_token TEXT;
  v_response RECORD;
  v_api_response JSONB;
  v_channels JSONB;
  v_channel JSONB;
BEGIN
  -- Get Slack token from vault
  SELECT decrypted_secret INTO v_slack_token
  FROM vault.decrypted_secrets
  WHERE name = 'slack_token';
  
  IF v_slack_token IS NULL THEN
    RETURN QUERY SELECT 0, 0, 1;
    RETURN;
  END IF;
  
  -- Process notifications needing channel lookup
  FOR v_notification IN
    SELECT id, payload
    FROM slack_notifications
    WHERE status = 'pending_lookup'
      AND attempts < 3
    ORDER BY created_at
    LIMIT p_limit
  LOOP
    v_processed := v_processed + 1;
    v_channel_name := v_notification.payload->>'channel_name';
    
    BEGIN
      -- First check cache again (might have been updated by another process)
      v_channel_id := get_cached_slack_channel(v_channel_name);
      
      IF v_channel_id IS NOT NULL THEN
        -- Found in cache now, promote to pending
        UPDATE slack_notifications
        SET status = 'pending',
            channel_id = v_channel_id,
            payload = payload - 'needs_channel_lookup' - 'channel_name',
            attempts = 0
        WHERE id = v_notification.id;
        
        v_resolved := v_resolved + 1;
      ELSE
        -- Make API call to resolve channel
        SELECT * INTO v_response FROM http((
          'GET',
          'https://slack.com/api/conversations.list?limit=1000&types=public_channel',
          ARRAY[http_header('authorization', 'Bearer ' || v_slack_token)],
          'application/json',
          ''
        )::http_request);
        
        IF v_response.status = 200 THEN
          v_api_response := v_response.content::jsonb;
          v_channels := v_api_response->'channels';
          
          -- Search for the channel
          FOR v_channel IN SELECT jsonb_array_elements(v_channels)
          LOOP
            IF (v_channel->>'name') = v_channel_name THEN
              v_channel_id := v_channel->>'id';
              EXIT;
            END IF;
          END LOOP;
          
          IF v_channel_id IS NOT NULL THEN
            -- Found channel - update cache and notification
            PERFORM update_slack_channel_cache(v_channel_name, v_channel_id, 24);
            
            UPDATE slack_notifications
            SET status = 'pending',
                channel_id = v_channel_id,
                payload = payload - 'needs_channel_lookup' - 'channel_name',
                attempts = 0
            WHERE id = v_notification.id;
            
            v_resolved := v_resolved + 1;
          ELSE
            -- Channel not found, increment attempts
            UPDATE slack_notifications
            SET attempts = attempts + 1,
                last_attempt_at = NOW()
            WHERE id = v_notification.id;
            
            -- If max attempts reached, fallback to general
            IF (SELECT attempts FROM slack_notifications WHERE id = v_notification.id) >= 3 THEN
              -- Get general channel ID (should be cached)
              v_channel_id := get_cached_slack_channel('general');
              IF v_channel_id IS NULL THEN
                v_channel_id := 'C0337E73W'; -- Hardcoded fallback
              END IF;
              
              UPDATE slack_notifications
              SET status = 'pending',
                  channel_id = v_channel_id,
                  payload = payload || jsonb_build_object(
                    'text', '⚠️ Channel #' || v_channel_name || ' not found. Routing to #general.\n\n' || (payload->>'text'),
                    'fallback_used', true
                  ) - 'needs_channel_lookup' - 'channel_name',
                  attempts = 0
              WHERE id = v_notification.id;
              
              v_resolved := v_resolved + 1;
            END IF;
          END IF;
        ELSE
          -- API error, increment attempts
          UPDATE slack_notifications
          SET attempts = attempts + 1,
              last_attempt_at = NOW(),
              error = 'API error: ' || v_response.status
          WHERE id = v_notification.id;
        END IF;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      UPDATE slack_notifications
      SET status = 'failed',
          error = 'Lookup error: ' || SQLERRM
      WHERE id = v_notification.id;
      v_failed := v_failed + 1;
    END;
  END LOOP;
  
  RETURN QUERY SELECT v_processed, v_resolved, v_failed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Phase 6: Update existing data to have proper expiry times
UPDATE slack_channels 
SET cache_expires_at = NOW() + INTERVAL '1 hour',
    last_api_lookup_at = COALESCE(updated_at, created_at)
WHERE cache_expires_at IS NULL;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_cached_slack_channel(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION update_slack_channel_cache(VARCHAR, VARCHAR, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION queue_notification_with_cache_only(UUID, VARCHAR, VARCHAR, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION process_slack_channel_lookups(INTEGER) TO authenticated;

-- Create view for monitoring cache status
CREATE OR REPLACE VIEW v_slack_channel_cache_status AS
SELECT 
  channel_name,
  channel_id,
  CASE 
    WHEN cache_expires_at > NOW() THEN 'Valid'
    WHEN cache_expires_at <= NOW() THEN 'Expired'
    ELSE 'Unknown'
  END as cache_status,
  cache_expires_at,
  last_api_lookup_at,
  NOW() - last_api_lookup_at as age_since_lookup,
  active
FROM slack_channels
ORDER BY cache_expires_at DESC;

GRANT SELECT ON v_slack_channel_cache_status TO authenticated;