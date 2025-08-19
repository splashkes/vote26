-- Fix broadcast cache invalidation triggers with correct UUID comparisons
-- CRITICAL FIX: Use NEW.art_uuid instead of NEW.art_id to prevent UUID=VARCHAR errors

-- 1. Drop any existing triggers to ensure clean state
DROP TRIGGER IF EXISTS cache_invalidate_art_trigger ON art;
DROP TRIGGER IF EXISTS cache_invalidate_votes_trigger ON votes;
DROP TRIGGER IF EXISTS cache_invalidate_bids_trigger ON bids;
DROP TRIGGER IF EXISTS cache_invalidate_media_trigger ON art_media;

-- 2. Update broadcast cache invalidation function with UUID fixes
CREATE OR REPLACE FUNCTION broadcast_cache_invalidation()
RETURNS TRIGGER AS $$
DECLARE
  v_event_eid VARCHAR;
  v_round INT;
  v_easel VARCHAR;
  v_notification_channel VARCHAR;
  v_notification_payload JSONB;
BEGIN
  -- Get event EID for the affected record
  IF TG_TABLE_NAME = 'art' THEN
    SELECT e.eid, NEW.round, NEW.easel INTO v_event_eid, v_round, v_easel
    FROM events e WHERE e.id = NEW.event_id;
  ELSIF TG_TABLE_NAME = 'votes' THEN
    -- CRITICAL FIX: Use NEW.art_uuid (UUID) instead of NEW.art_id (VARCHAR)
    SELECT e.eid, a.round, a.easel INTO v_event_eid, v_round, v_easel
    FROM art a JOIN events e ON e.id = a.event_id
    WHERE a.id = NEW.art_uuid;  -- FIXED: UUID = UUID comparison
  ELSIF TG_TABLE_NAME = 'bids' THEN
    -- CRITICAL FIX: Use NEW.art_uuid (UUID) instead of NEW.art_id (VARCHAR)
    SELECT e.eid, a.round, a.easel INTO v_event_eid, v_round, v_easel
    FROM art a JOIN events e ON e.id = a.event_id
    WHERE a.id = NEW.art_uuid;  -- FIXED: UUID = UUID comparison
  ELSIF TG_TABLE_NAME = 'art_media' THEN
    SELECT e.eid INTO v_event_eid
    FROM art a JOIN events e ON e.id = a.event_id
    WHERE a.id = NEW.artwork_id;
  END IF;

  -- Only proceed if we have an event EID
  IF v_event_eid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Determine notification channel and payload based on table and operation
  CASE TG_TABLE_NAME
    WHEN 'art' THEN
      -- Art status changes affect main event endpoint and media endpoint
      v_notification_channel := 'cache_invalidate_' || v_event_eid;
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
      -- Vote changes affect main event endpoint
      v_notification_channel := 'cache_invalidate_' || v_event_eid;
      v_notification_payload := jsonb_build_object(
        'type', 'vote_cast',
        'event_eid', v_event_eid,
        'endpoints', jsonb_build_array(
          '/live/event/' || v_event_eid
        ),
        'art_id', NEW.art_id,  -- Use VARCHAR art_id for payload (human-readable)
        'art_uuid', NEW.art_uuid,  -- Include UUID for reference
        'round', v_round,
        'easel', v_easel,
        'timestamp', EXTRACT(EPOCH FROM NOW())
      );

    WHEN 'bids' THEN
      -- Bid changes affect main event endpoint and specific bid endpoint
      v_notification_channel := 'cache_invalidate_' || v_event_eid;
      v_notification_payload := jsonb_build_object(
        'type', 'bid_placed',
        'event_eid', v_event_eid,
        'endpoints', jsonb_build_array(
          '/live/event/' || v_event_eid,
          '/live/event/' || v_event_eid || '-' || v_round || '-' || v_easel || '/bids'
        ),
        'art_id', NEW.art_id,  -- Use VARCHAR art_id for payload (human-readable)
        'art_uuid', NEW.art_uuid,  -- Include UUID for reference  
        'round', v_round,
        'easel', v_easel,
        'amount', NEW.amount,
        'timestamp', EXTRACT(EPOCH FROM NOW())
      );

    WHEN 'art_media' THEN
      -- Media changes affect media endpoint
      v_notification_channel := 'cache_invalidate_' || v_event_eid;
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

  -- Send broadcast notification
  PERFORM pg_notify(
    v_notification_channel,
    v_notification_payload::text
  );

  -- Also send to global cache invalidation channel for monitoring
  PERFORM pg_notify(
    'global_cache_stats',
    jsonb_build_object(
      'event_eid', v_event_eid,
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'timestamp', EXTRACT(EPOCH FROM NOW())
    )::text
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 3. Create triggers for each relevant table with UUID fixes
CREATE TRIGGER cache_invalidate_art_trigger
  AFTER UPDATE ON art
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.description IS DISTINCT FROM NEW.description)
  EXECUTE FUNCTION broadcast_cache_invalidation();

CREATE TRIGGER cache_invalidate_votes_trigger
  AFTER INSERT ON votes
  FOR EACH ROW
  EXECUTE FUNCTION broadcast_cache_invalidation();

CREATE TRIGGER cache_invalidate_bids_trigger
  AFTER INSERT ON bids
  FOR EACH ROW
  EXECUTE FUNCTION broadcast_cache_invalidation();

CREATE TRIGGER cache_invalidate_media_trigger
  AFTER INSERT OR UPDATE ON art_media
  FOR EACH ROW
  EXECUTE FUNCTION broadcast_cache_invalidation();

-- Add comment explaining the UUID fix
COMMENT ON FUNCTION broadcast_cache_invalidation IS 
'Broadcast cache invalidation trigger function.
CRITICAL FIX: Uses NEW.art_uuid (UUID) instead of NEW.art_id (VARCHAR) 
for votes and bids table joins to prevent "operator does not exist: uuid = character varying" errors.
- Lines 22 & 26: Changed WHERE a.id = NEW.art_id to WHERE a.id = NEW.art_uuid
- Payload includes both art_id (VARCHAR, human-readable) and art_uuid (UUID, relational)
- Ensures proper cache invalidation for /live/ endpoints without breaking transactions';