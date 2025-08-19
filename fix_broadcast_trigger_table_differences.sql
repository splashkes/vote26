-- Quick fix for broadcast triggers - handle table structure differences
-- Votes table: art_id=VARCHAR, art_uuid=UUID
-- Bids table: art_id=UUID (misnamed, should be art_uuid)

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
    -- Votes table: Use art_uuid (UUID) for join
    SELECT e.eid, a.round, a.easel INTO v_event_eid, v_round, v_easel
    FROM art a JOIN events e ON e.id = a.event_id
    WHERE a.id = NEW.art_uuid;
  ELSIF TG_TABLE_NAME = 'bids' THEN
    -- Bids table: Use art_id (UUID, misnamed but that's what exists)
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
        'art_id', NEW.art_id,  -- VARCHAR format for human readability
        'art_uuid', NEW.art_uuid,  -- UUID for reference
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
        'art_uuid', NEW.art_id,  -- This is actually UUID (misnamed column)
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

-- Add comment explaining the table structure differences
COMMENT ON FUNCTION broadcast_cache_invalidation IS 
'Broadcast cache invalidation with table structure compatibility.
IMPORTANT: Tables have different art reference column structures:
- votes: art_id=VARCHAR("AB3027-1-5"), art_uuid=UUID (uses NEW.art_uuid for joins)
- bids: art_id=UUID (misnamed, should be art_uuid) (uses NEW.art_id for joins)
- Future: Should standardize bids table to match votes table structure';