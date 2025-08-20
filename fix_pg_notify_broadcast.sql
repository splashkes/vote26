-- Fix broadcast to use pg_notify with correct column names
CREATE OR REPLACE FUNCTION broadcast_cache_invalidation()
RETURNS TRIGGER AS $$
DECLARE
  v_event_eid VARCHAR;
  v_round INT;
  v_easel VARCHAR;
  v_notification_channel VARCHAR;
  v_notification_payload JSONB;
  v_endpoint_path VARCHAR;
  v_cache_version BIGINT;
BEGIN
  -- Get event EID for the affected record
  IF TG_TABLE_NAME = 'art' THEN
    SELECT e.eid, NEW.round, NEW.easel INTO v_event_eid, v_round, v_easel
    FROM events e WHERE e.id = NEW.event_id;
  ELSIF TG_TABLE_NAME = 'votes' THEN
    SELECT e.eid, a.round, a.easel INTO v_event_eid, v_round, v_easel
    FROM art a JOIN events e ON e.id = a.event_id
    WHERE a.id = NEW.art_uuid;
  ELSIF TG_TABLE_NAME = 'bids' THEN
    SELECT e.eid, a.round, a.easel INTO v_event_eid, v_round, v_easel
    FROM art a JOIN events e ON e.id = a.event_id
    WHERE a.id = NEW.art_id;
  ELSIF TG_TABLE_NAME = 'art_media' THEN
    SELECT e.eid, a.round, a.easel INTO v_event_eid, v_round, v_easel
    FROM art a JOIN events e ON e.id = a.event_id
    WHERE a.id = NEW.art_id;
  END IF;

  -- Only proceed if we have an event EID
  IF v_event_eid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Update endpoint cache versions
  CASE TG_TABLE_NAME
    WHEN 'art' THEN
      v_endpoint_path := '/live/event/' || v_event_eid;
      PERFORM update_endpoint_cache_version(v_endpoint_path, v_event_eid);
      v_endpoint_path := '/live/event/' || v_event_eid || '/media';
      PERFORM update_endpoint_cache_version(v_endpoint_path, v_event_eid);
    WHEN 'votes' THEN
      v_endpoint_path := '/live/event/' || v_event_eid;
      PERFORM update_endpoint_cache_version(v_endpoint_path, v_event_eid);
    WHEN 'bids' THEN
      v_endpoint_path := '/live/event/' || v_event_eid;
      PERFORM update_endpoint_cache_version(v_endpoint_path, v_event_eid);
      v_endpoint_path := '/live/event/' || v_event_eid || '-' || v_round || '-' || v_easel || '/bids';
      PERFORM update_endpoint_cache_version(v_endpoint_path, v_event_eid);
    WHEN 'art_media' THEN
      v_endpoint_path := '/live/event/' || v_event_eid || '/media';
      PERFORM update_endpoint_cache_version(v_endpoint_path, v_event_eid);
  END CASE;

  -- Get current cache version
  v_cache_version := EXTRACT(EPOCH FROM NOW()) * 1000;

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
        'cache_version', v_cache_version
      );
    WHEN 'votes' THEN
      v_notification_payload := jsonb_build_object(
        'type', 'vote_cast',
        'event_eid', v_event_eid,
        'endpoints', jsonb_build_array(
          '/live/event/' || v_event_eid
        ),
        'art_id', NEW.art_id,
        'art_uuid', NEW.art_uuid,
        'round', v_round,
        'easel', v_easel,
        'timestamp', EXTRACT(EPOCH FROM NOW()),
        'cache_version', v_cache_version
      );
    WHEN 'bids' THEN
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
        'timestamp', EXTRACT(EPOCH FROM NOW()),
        'cache_version', v_cache_version
      );
    WHEN 'art_media' THEN
      v_notification_payload := jsonb_build_object(
        'type', 'media_updated',
        'event_eid', v_event_eid,
        'endpoints', jsonb_build_array(
          '/live/event/' || v_event_eid || '/media'
        ),
        'art_id', NEW.art_id,
        'round', v_round,
        'easel', v_easel,
        'timestamp', EXTRACT(EPOCH FROM NOW()),
        'cache_version', v_cache_version
      );
  END CASE;

  -- Send broadcast notification using pg_notify (matching frontend subscription)
  v_notification_channel := 'cache_invalidate_' || v_event_eid;
  PERFORM pg_notify(
    v_notification_channel,
    v_notification_payload::text
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;