-- Fix art_media trigger to include round/easel information
-- This was missing and could cause broadcast processing issues

CREATE OR REPLACE FUNCTION broadcast_cache_invalidation()
RETURNS TRIGGER AS $$
DECLARE
  v_event_eid VARCHAR;
  v_round INT;
  v_easel VARCHAR;
  v_notification_payload JSONB;
  v_endpoint_path VARCHAR;
  v_cache_version BIGINT;
BEGIN
  -- Get event EID for the affected record
  IF TG_TABLE_NAME = 'art' THEN
    SELECT e.eid, NEW.round, NEW.easel INTO v_event_eid, v_round, v_easel
    FROM events e WHERE e.id = NEW.event_id;
  ELSIF TG_TABLE_NAME = 'votes' THEN
    -- Use art_uuid for votes
    SELECT e.eid, a.round, a.easel INTO v_event_eid, v_round, v_easel
    FROM art a JOIN events e ON e.id = a.event_id
    WHERE a.id = NEW.art_uuid;
  ELSIF TG_TABLE_NAME = 'bids' THEN
    -- Use art_id for bids (it's UUID in bids table)
    SELECT e.eid, a.round, a.easel INTO v_event_eid, v_round, v_easel
    FROM art a JOIN events e ON e.id = a.event_id
    WHERE a.id = NEW.art_id;
  ELSIF TG_TABLE_NAME = 'art_media' THEN
    -- FIXED: Include round/easel for art_media (was missing before)
    SELECT e.eid, a.round, a.easel INTO v_event_eid, v_round, v_easel
    FROM art a JOIN events e ON e.id = a.event_id
    WHERE a.id = NEW.art_id;
  END IF;

  -- Only proceed if we have an event EID
  IF v_event_eid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Update endpoint cache versions and build notification payload
  CASE TG_TABLE_NAME
    WHEN 'art' THEN
      -- Update main event endpoint
      v_endpoint_path := '/live/event/' || v_event_eid;
      PERFORM update_endpoint_cache_version(v_endpoint_path, v_event_eid);
      
      -- Update media endpoint  
      v_endpoint_path := '/live/event/' || v_event_eid || '/media';
      PERFORM update_endpoint_cache_version(v_endpoint_path, v_event_eid);
      
      -- Get current cache version (millisecond timestamp)
      v_cache_version := EXTRACT(EPOCH FROM NOW()) * 1000;
      
      v_notification_payload := jsonb_build_object(
        'type', 'art_updated',
        'event_eid', v_event_eid,
        'endpoints', jsonb_build_array(
          '/live/event/' || v_event_eid,
          '/live/event/' || v_event_eid || '/media'
        ),
        'art_id', NEW.id,
        'round', v_round,
        'easel', v_easel,
        'timestamp', EXTRACT(EPOCH FROM NOW()),
        'cache_version', v_cache_version
      );

    WHEN 'votes' THEN
      -- Update main event endpoint (votes affect event data)
      v_endpoint_path := '/live/event/' || v_event_eid;
      PERFORM update_endpoint_cache_version(v_endpoint_path, v_event_eid);
      
      -- Get current cache version
      v_cache_version := EXTRACT(EPOCH FROM NOW()) * 1000;
      
      v_notification_payload := jsonb_build_object(
        'type', 'vote_cast',
        'event_eid', v_event_eid,
        'endpoints', jsonb_build_array(
          '/live/event/' || v_event_eid
        ),
        'art_id', NEW.art_id,  -- VARCHAR format
        'art_uuid', NEW.art_uuid,  -- UUID format
        'round', v_round,
        'easel', v_easel,
        'timestamp', EXTRACT(EPOCH FROM NOW()),
        'cache_version', v_cache_version
      );

    WHEN 'bids' THEN
      -- Update main event endpoint (bid counts affect event data)
      v_endpoint_path := '/live/event/' || v_event_eid;
      PERFORM update_endpoint_cache_version(v_endpoint_path, v_event_eid);
      
      -- Update specific bid endpoint
      v_endpoint_path := '/live/event/' || v_event_eid || '-' || v_round || '-' || v_easel || '/bids';
      PERFORM update_endpoint_cache_version(v_endpoint_path, v_event_eid);
      
      -- Get current cache version
      v_cache_version := EXTRACT(EPOCH FROM NOW()) * 1000;
      
      v_notification_payload := jsonb_build_object(
        'type', 'bid_placed',
        'event_eid', v_event_eid,
        'endpoints', jsonb_build_array(
          '/live/event/' || v_event_eid,
          '/live/event/' || v_event_eid || '-' || v_round || '-' || v_easel || '/bids'
        ),
        'art_uuid', NEW.art_id,  -- This is UUID in bids table
        'round', v_round,
        'easel', v_easel,
        'amount', NEW.amount,
        'timestamp', EXTRACT(EPOCH FROM NOW()),
        'cache_version', v_cache_version
      );

    WHEN 'art_media' THEN
      -- Update media endpoint
      v_endpoint_path := '/live/event/' || v_event_eid || '/media';
      PERFORM update_endpoint_cache_version(v_endpoint_path, v_event_eid);
      
      -- Get current cache version
      v_cache_version := EXTRACT(EPOCH FROM NOW()) * 1000;
      
      v_notification_payload := jsonb_build_object(
        'type', 'media_updated',
        'event_eid', v_event_eid,
        'endpoints', jsonb_build_array(
          '/live/event/' || v_event_eid || '/media'
        ),
        'art_id', NEW.art_id,
        'round', v_round,  -- FIXED: Now includes round
        'easel', v_easel,  -- FIXED: Now includes easel
        'timestamp', EXTRACT(EPOCH FROM NOW()),
        'cache_version', v_cache_version
      );
  END CASE;

  -- Send broadcast using realtime.send() with CORRECT parameter order
  -- realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true)
  BEGIN
    PERFORM realtime.send(
      v_notification_payload,                 -- payload (first)
      'cache_invalidation',                   -- event (second)
      'cache_invalidate_' || v_event_eid,     -- topic (third)
      false                                   -- private=false (public broadcast)
    );
    
  EXCEPTION
    WHEN OTHERS THEN
      -- If realtime.send fails, log but don't break the transaction
      RAISE WARNING 'Failed to send realtime broadcast: %', SQLERRM;
  END;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Comment explaining the fix
COMMENT ON FUNCTION broadcast_cache_invalidation IS 
'Fixed art_media trigger to include round/easel information in payload.
This ensures consistent payload structure across all broadcast types (bids, votes, media, art).
Enhanced broadcast cache invalidation with per-endpoint cache version tracking.';