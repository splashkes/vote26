-- Broadcast Cache Invalidation System for /live/ Endpoints
-- Matches endpoint URLs: /live/event/{eid}, /live/event/{eid}/media, /live/event/{eid}-{round}-{easel}/bids
-- Event-scoped notifications to prevent data floods

-- 1. Create broadcast cache invalidation function
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
    SELECT e.eid, a.round, a.easel INTO v_event_eid, v_round, v_easel
    FROM art a JOIN events e ON e.id = a.event_id
    WHERE a.id = NEW.art_id;
  ELSIF TG_TABLE_NAME = 'bids' THEN
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
        'art_id', NEW.art_id,
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
        'art_id', NEW.art_id,
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

-- 2. Create triggers for each relevant table
DROP TRIGGER IF EXISTS cache_invalidate_art_trigger ON art;
CREATE TRIGGER cache_invalidate_art_trigger
  AFTER UPDATE ON art
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.description IS DISTINCT FROM NEW.description)
  EXECUTE FUNCTION broadcast_cache_invalidation();

DROP TRIGGER IF EXISTS cache_invalidate_votes_trigger ON votes;
CREATE TRIGGER cache_invalidate_votes_trigger
  AFTER INSERT ON votes
  FOR EACH ROW
  EXECUTE FUNCTION broadcast_cache_invalidation();

DROP TRIGGER IF EXISTS cache_invalidate_bids_trigger ON bids;
CREATE TRIGGER cache_invalidate_bids_trigger
  AFTER INSERT ON bids
  FOR EACH ROW
  EXECUTE FUNCTION broadcast_cache_invalidation();

DROP TRIGGER IF EXISTS cache_invalidate_media_trigger ON art_media;
CREATE TRIGGER cache_invalidate_media_trigger
  AFTER INSERT OR UPDATE ON art_media
  FOR EACH ROW
  EXECUTE FUNCTION broadcast_cache_invalidation();

-- 3. Create function to manually trigger cache invalidation for testing
CREATE OR REPLACE FUNCTION manual_cache_invalidation(
  p_event_eid VARCHAR,
  p_endpoint VARCHAR DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_notification_payload JSONB;
BEGIN
  v_notification_payload := jsonb_build_object(
    'type', 'manual_invalidation',
    'event_eid', p_event_eid,
    'endpoints', CASE 
      WHEN p_endpoint IS NOT NULL THEN jsonb_build_array(p_endpoint)
      ELSE jsonb_build_array(
        '/live/event/' || p_event_eid,
        '/live/event/' || p_event_eid || '/media'
      )
    END,
    'timestamp', EXTRACT(EPOCH FROM NOW())
  );

  PERFORM pg_notify(
    'cache_invalidate_' || p_event_eid,
    v_notification_payload::text
  );
END;
$$ LANGUAGE plpgsql;

-- 4. Create monitoring function to check broadcast activity
CREATE OR REPLACE FUNCTION get_cache_invalidation_stats(
  p_event_eid VARCHAR DEFAULT NULL,
  p_minutes_back INT DEFAULT 60
)
RETURNS TABLE(
  event_eid VARCHAR,
  table_name VARCHAR,
  operation VARCHAR,
  count BIGINT,
  last_invalidation TIMESTAMPTZ
) AS $$
BEGIN
  -- This would require storing broadcast history, which we don't by default
  -- For now, return a message about monitoring setup needed
  RAISE NOTICE 'To track cache invalidation stats, implement a broadcast history table';
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION manual_cache_invalidation(VARCHAR, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION get_cache_invalidation_stats(VARCHAR, INT) TO authenticated;