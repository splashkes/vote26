-- Use pg_notify instead of realtime.send() for media triggers
-- This should work in client operation contexts

CREATE OR REPLACE FUNCTION broadcast_cache_invalidation_media()
RETURNS TRIGGER AS $$
DECLARE
  v_event_eid VARCHAR;
  v_round INT;
  v_easel VARCHAR;
  v_notification_payload JSONB;
  v_cache_version BIGINT;
BEGIN
  -- Get event EID for art_media
  SELECT e.eid, a.round, a.easel INTO v_event_eid, v_round, v_easel
  FROM art a JOIN events e ON e.id = a.event_id
  WHERE a.id = NEW.art_id;

  -- Only proceed if we have an event EID
  IF v_event_eid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Update endpoint cache version
  PERFORM update_endpoint_cache_version('/live/event/' || v_event_eid || '/media', v_event_eid);

  -- Get current cache version
  v_cache_version := EXTRACT(EPOCH FROM NOW()) * 1000;

  -- Build payload
  v_notification_payload := jsonb_build_object(
    'type', 'media_updated',
    'event_eid', v_event_eid,
    'endpoints', jsonb_build_array('/live/event/' || v_event_eid || '/media'),
    'art_id', NEW.art_id,
    'round', v_round,
    'easel', v_easel,
    'timestamp', EXTRACT(EPOCH FROM NOW()),
    'cache_version', v_cache_version
  );

  -- Try both methods: realtime.send AND pg_notify
  BEGIN
    -- Try realtime.send first
    PERFORM realtime.send(
      v_notification_payload,
      'cache_invalidation',
      'cache_invalidate_' || v_event_eid,
      false
    );
  EXCEPTION WHEN OTHERS THEN
    -- If realtime.send fails, use pg_notify as fallback
    PERFORM pg_notify('cache_invalidate_' || v_event_eid, v_notification_payload::text);
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Replace media trigger to use the new function
DROP TRIGGER IF EXISTS cache_invalidate_media_trigger ON art_media;
CREATE TRIGGER cache_invalidate_media_trigger
  AFTER INSERT OR UPDATE ON art_media
  FOR EACH ROW EXECUTE FUNCTION broadcast_cache_invalidation_media();