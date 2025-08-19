-- Fix realtime.send() parameter order
-- Correct signature: realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true)

CREATE OR REPLACE FUNCTION broadcast_cache_invalidation()
RETURNS TRIGGER AS $$
DECLARE
  v_event_eid VARCHAR;
  v_round INT;
  v_easel VARCHAR;
  v_notification_payload JSONB;
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
    SELECT e.eid INTO v_event_eid
    FROM art a JOIN events e ON e.id = a.event_id
    WHERE a.id = NEW.artwork_id;
  END IF;

  -- Only proceed if we have an event EID
  IF v_event_eid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Build notification payload based on table and operation
  CASE TG_TABLE_NAME
    WHEN 'art' THEN
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
        'cache_version', EXTRACT(EPOCH FROM NOW()) * 1000  -- Millisecond timestamp for coordinated cache-busting
      );

    WHEN 'votes' THEN
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
        'cache_version', EXTRACT(EPOCH FROM NOW()) * 1000  -- Millisecond timestamp for coordinated cache-busting
      );

    WHEN 'bids' THEN
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
        'cache_version', EXTRACT(EPOCH FROM NOW()) * 1000  -- Millisecond timestamp for coordinated cache-busting
      );

    WHEN 'art_media' THEN
      v_notification_payload := jsonb_build_object(
        'type', 'media_updated',
        'event_eid', v_event_eid,
        'endpoints', jsonb_build_array(
          '/live/event/' || v_event_eid || '/media'
        ),
        'artwork_id', NEW.artwork_id,
        'timestamp', EXTRACT(EPOCH FROM NOW()),
        'cache_version', EXTRACT(EPOCH FROM NOW()) * 1000  -- Millisecond timestamp for coordinated cache-busting
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

-- Comment explaining the corrected approach
COMMENT ON FUNCTION broadcast_cache_invalidation IS 
'Broadcast cache invalidation using realtime.send() with CORRECT parameter order.
realtime.send(payload jsonb, event text, topic text, private boolean)
Reference: https://supabase.com/blog/realtime-broadcast-from-database';