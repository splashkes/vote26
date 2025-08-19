-- Create a function that clients can call to trigger broadcasts manually
-- This bypasses trigger context limitations

CREATE OR REPLACE FUNCTION trigger_media_broadcast(p_art_media_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_event_eid VARCHAR;
  v_round INT;
  v_easel VARCHAR;
  v_art_id UUID;
  v_notification_payload JSONB;
  v_cache_version BIGINT;
BEGIN
  -- Get the art_media record and related info
  SELECT 
    am.art_id,
    e.eid, 
    a.round, 
    a.easel 
  INTO v_art_id, v_event_eid, v_round, v_easel
  FROM art_media am
  JOIN art a ON a.id = am.art_id
  JOIN events e ON e.id = a.event_id
  WHERE am.id = p_art_media_id;

  -- Return error if not found
  IF v_event_eid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Art media record not found');
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
    'art_id', v_art_id,
    'round', v_round,
    'easel', v_easel,
    'timestamp', EXTRACT(EPOCH FROM NOW()),
    'cache_version', v_cache_version
  );

  -- Send broadcast (this should work in function context)
  PERFORM realtime.send(
    v_notification_payload,
    'cache_invalidation',
    'cache_invalidate_' || v_event_eid,
    false
  );

  RETURN jsonb_build_object(
    'success', true, 
    'event_eid', v_event_eid,
    'payload', v_notification_payload
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION trigger_media_broadcast(UUID) TO authenticated;