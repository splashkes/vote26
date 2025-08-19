-- Fix realtime.broadcast_changes with proper record passing
-- The function needs actual records, not JSON strings

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
        'timestamp', EXTRACT(EPOCH FROM NOW())
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
        'timestamp', EXTRACT(EPOCH FROM NOW())
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
        'timestamp', EXTRACT(EPOCH FROM NOW())
      );

    WHEN 'art_media' THEN
      v_notification_payload := jsonb_build_object(
        'type', 'media_updated',
        'event_eid', v_event_eid,
        'endpoints', jsonb_build_array(
          '/live/event/' || v_event_eid || '/media'
        ),
        'artwork_id', NEW.artwork_id,
        'timestamp', EXTRACT(EPOCH FROM NOW())
      );
  END CASE;

  -- Send broadcast using Supabase realtime.broadcast_changes() with proper records
  BEGIN
    PERFORM realtime.broadcast_changes(
      'cache_invalidate_' || v_event_eid,    -- topic_name
      'cache_invalidation',                   -- event_name
      TG_OP,                                 -- operation
      TG_TABLE_NAME,                         -- table_name
      TG_TABLE_SCHEMA,                       -- table_schema
      NEW,                                   -- new record (actual record, not JSON)
      OLD,                                   -- old record (actual record, not JSON)
      'info'                                 -- level
    );
    
    -- Also add custom payload info in the record
    -- Use pg_notify as backup to ensure broadcast works
    PERFORM pg_notify(
      'cache_invalidate_' || v_event_eid,
      v_notification_payload::text
    );
    
  EXCEPTION
    WHEN OTHERS THEN
      -- If realtime broadcast fails, at least send pg_notify
      RAISE WARNING 'Realtime broadcast failed, using pg_notify fallback: %', SQLERRM;
      PERFORM pg_notify(
        'cache_invalidate_' || v_event_eid,
        v_notification_payload::text
      );
  END;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Comment explaining the dual approach
COMMENT ON FUNCTION broadcast_cache_invalidation IS 
'Broadcast cache invalidation with both realtime.broadcast_changes() and pg_notify fallback.
Uses actual NEW/OLD records for realtime.broadcast_changes(), not JSON strings.
Includes pg_notify fallback to ensure broadcasts work even if realtime.broadcast_changes() fails.
Handles UUID/VARCHAR differences between votes and bids tables properly.';