-- Fix Photo Upload Disappearing Easel Issue
-- Date: 2025-09-26
-- Issue: Recently added artists' easels disappear 15-20 seconds after photo upload
-- Root Cause: Broadcast triggers are firing before art records are fully indexed/cached
-- Solution: Add delay to media broadcasts and better conflict resolution

-- Step 1: Modify broadcast_cache_invalidation_media to include safety checks
CREATE OR REPLACE FUNCTION public.broadcast_cache_invalidation_media()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions', 'realtime'
AS $function$
DECLARE
  v_event_eid VARCHAR;
  v_round INT;
  v_easel VARCHAR;
  v_notification_payload JSONB;
  v_cache_version BIGINT;
  v_art_created_at TIMESTAMP;
BEGIN
  -- Get event EID and art info for art_media
  SELECT e.eid, a.round, a.easel, a.created_at
  INTO v_event_eid, v_round, v_easel, v_art_created_at
  FROM art a JOIN events e ON e.id = a.event_id
  WHERE a.id = NEW.art_id;

  -- Only proceed if we have an event EID
  IF v_event_eid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- SAFETY CHECK: For recently created art (< 30 seconds), add delay to prevent race conditions
  IF v_art_created_at > NOW() - INTERVAL '30 seconds' THEN
    -- Log the delay for debugging
    INSERT INTO system_logs (service, operation, level, message, request_data)
    VALUES (
      'broadcast_delay',
      'media_upload_delay',
      'info',
      format('Delaying media broadcast for recently created art (created %s seconds ago)',
        EXTRACT(EPOCH FROM (NOW() - v_art_created_at))
      ),
      jsonb_build_object(
        'art_id', NEW.art_id,
        'event_eid', v_event_eid,
        'round', v_round,
        'easel', v_easel,
        'art_created_at', v_art_created_at::text,
        'delay_seconds', EXTRACT(EPOCH FROM (NOW() - v_art_created_at))
      )
    );

    -- Use pg_sleep to add a small delay (2 seconds) for recently created art
    PERFORM pg_sleep(2);
  END IF;

  -- Update endpoint cache version
  PERFORM update_endpoint_cache_version('/live/event/' || v_event_eid || '/media', v_event_eid);

  -- Get current cache version
  v_cache_version := EXTRACT(EPOCH FROM NOW()) * 1000;

  -- Build payload with additional metadata for conflict resolution
  v_notification_payload := jsonb_build_object(
    'type', 'media_updated',
    'event_eid', v_event_eid,
    'endpoints', jsonb_build_array('/live/event/' || v_event_eid || '/media'),
    'art_id', NEW.art_id,
    'round', v_round,
    'easel', v_easel,
    'timestamp', EXTRACT(EPOCH FROM NOW()),
    'cache_version', v_cache_version,
    -- NEW: Add metadata to help client-side conflict resolution
    'art_created_at', EXTRACT(EPOCH FROM v_art_created_at),
    'media_id', NEW.media_id,
    'is_recent_art', (v_art_created_at > NOW() - INTERVAL '60 seconds')
  );

  -- Send realtime broadcast with SECURITY DEFINER privileges
  PERFORM realtime.send(
    v_notification_payload,
    'cache_invalidation',
    'cache_invalidate_' || v_event_eid,
    false
  );

  RETURN NEW;
END;
$function$;

-- Step 2: Also modify main broadcast function to be more careful with recently created art
CREATE OR REPLACE FUNCTION public.broadcast_cache_invalidation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions', 'realtime'
AS $function$
DECLARE
  v_event_eid VARCHAR;
  v_round INT;
  v_easel VARCHAR;
  v_notification_payload JSONB;
  v_endpoint_path VARCHAR;
  v_cache_version BIGINT;
  v_artist_id UUID;
  v_art_created_at TIMESTAMP;
BEGIN
  -- Add support for payment_processing table
  IF TG_TABLE_NAME = 'art' THEN
    SELECT e.eid, NEW.round, NEW.easel, NEW.created_at INTO v_event_eid, v_round, v_easel, v_art_created_at
    FROM events e WHERE e.id = NEW.event_id;
  ELSIF TG_TABLE_NAME = 'votes' THEN
    SELECT e.eid, a.round, a.easel, a.created_at INTO v_event_eid, v_round, v_easel, v_art_created_at
    FROM art a JOIN events e ON e.id = a.event_id
    WHERE a.id = NEW.art_uuid;
  ELSIF TG_TABLE_NAME = 'bids' THEN
    SELECT e.eid, a.round, a.easel, a.created_at INTO v_event_eid, v_round, v_easel, v_art_created_at
    FROM art a JOIN events e ON e.id = a.event_id
    WHERE a.id = NEW.art_id;
  ELSIF TG_TABLE_NAME = 'art_media' THEN
    SELECT e.eid, a.round, a.easel, a.created_at INTO v_event_eid, v_round, v_easel, v_art_created_at
    FROM art a JOIN events e ON e.id = a.event_id
    WHERE a.id = NEW.art_id;
  ELSIF TG_TABLE_NAME = 'payment_processing' THEN
    -- NEW: Handle payment_processing table
    SELECT e.eid, a.round, a.easel, a.created_at INTO v_event_eid, v_round, v_easel, v_art_created_at
    FROM art a JOIN events e ON e.id = a.event_id
    WHERE a.id = NEW.art_id;
  ELSIF TG_TABLE_NAME = 'event_artists' THEN
    SELECT e.eid INTO v_event_eid
    FROM events e WHERE e.id = COALESCE(NEW.event_id, OLD.event_id);
    v_artist_id := COALESCE(NEW.artist_id, OLD.artist_id);
  ELSIF TG_TABLE_NAME = 'round_contestants' THEN
    SELECT e.eid, r.round_number INTO v_event_eid, v_round
    FROM rounds r JOIN events e ON r.event_id = e.id
    WHERE r.id = COALESCE(NEW.round_id, OLD.round_id);
    v_artist_id := COALESCE(NEW.artist_id, OLD.artist_id);
  ELSIF TG_TABLE_NAME = 'artwork_offers' THEN
    -- NEW: Handle artwork_offers table
    SELECT e.eid, a.round, a.easel, a.created_at INTO v_event_eid, v_round, v_easel, v_art_created_at
    FROM art a JOIN events e ON e.id = a.event_id
    WHERE a.id = COALESCE(NEW.art_id, OLD.art_id);
  ELSIF TG_TABLE_NAME = 'events' THEN
    -- NEW: Handle events table
    SELECT eid INTO v_event_eid FROM events WHERE id = COALESCE(NEW.id, OLD.id);
  END IF;

  IF v_event_eid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- SAFETY CHECK: For art_media operations on recently created art, skip main event broadcast
  -- to prevent overwriting optimistic updates
  IF TG_TABLE_NAME = 'art_media' AND v_art_created_at IS NOT NULL
     AND v_art_created_at > NOW() - INTERVAL '60 seconds' THEN

    -- Log the skip for debugging
    INSERT INTO system_logs (service, operation, level, message, request_data)
    VALUES (
      'broadcast_skip',
      'recent_art_media_skip',
      'info',
      format('Skipping main event broadcast for recent art media (art created %s seconds ago)',
        EXTRACT(EPOCH FROM (NOW() - v_art_created_at))
      ),
      jsonb_build_object(
        'art_id', NEW.art_id,
        'event_eid', v_event_eid,
        'round', v_round,
        'easel', v_easel,
        'skip_reason', 'recent_art_media'
      )
    );

    -- Only update media endpoint, skip main event endpoint to preserve optimistic state
    PERFORM update_endpoint_cache_version('/live/event/' || v_event_eid || '/media', v_event_eid);
    RETURN NEW;
  END IF;

  -- Update cache versions (existing logic continues)
  CASE TG_TABLE_NAME
    WHEN 'art' THEN
      PERFORM update_endpoint_cache_version('/live/event/' || v_event_eid, v_event_eid);
      PERFORM update_endpoint_cache_version('/live/event/' || v_event_eid || '/media', v_event_eid);
    WHEN 'votes' THEN
      PERFORM update_endpoint_cache_version('/live/event/' || v_event_eid, v_event_eid);
    WHEN 'bids' THEN
      -- FIXED: Update BOTH specific bid endpoint AND main event endpoint for Vote section
      PERFORM update_endpoint_cache_version('/live/event/' || v_event_eid || '-' || v_round || '-' || v_easel || '/bids', v_event_eid);
      PERFORM update_endpoint_cache_version('/live/event/' || v_event_eid, v_event_eid);
    WHEN 'art_media' THEN
      -- FIXED: Update BOTH media endpoint AND main event endpoint so photos show in Vote section
      PERFORM update_endpoint_cache_version('/live/event/' || v_event_eid || '/media', v_event_eid);
      PERFORM update_endpoint_cache_version('/live/event/' || v_event_eid, v_event_eid);
    WHEN 'payment_processing' THEN
      -- NEW: Update main event endpoint for payment status changes
      PERFORM update_endpoint_cache_version('/live/event/' || v_event_eid, v_event_eid);
    WHEN 'event_artists' THEN
      PERFORM update_endpoint_cache_version('/live/event/' || v_event_eid, v_event_eid);
      PERFORM update_endpoint_cache_version('/live/event/' || v_event_eid || '/artists', v_event_eid);
    WHEN 'round_contestants' THEN
      PERFORM update_endpoint_cache_version('/live/event/' || v_event_eid, v_event_eid);
      PERFORM update_endpoint_cache_version('/live/event/' || v_event_eid || '/artists', v_event_eid);
    WHEN 'artwork_offers' THEN
      -- NEW: Update main event endpoint for payment offers
      PERFORM update_endpoint_cache_version('/live/event/' || v_event_eid, v_event_eid);
    WHEN 'events' THEN
      -- NEW: Update main event endpoint for auction closure
      PERFORM update_endpoint_cache_version('/live/event/' || v_event_eid, v_event_eid);
  END CASE;

  v_cache_version := EXTRACT(EPOCH FROM NOW()) * 1000;

  -- Build payload (adding new table cases) - rest of function unchanged
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
    WHEN 'bids' THEN
      v_notification_payload := jsonb_build_object(
        'type', 'bid_placed',
        'event_eid', v_event_eid,
        'endpoints', jsonb_build_array(
          '/live/event/' || v_event_eid || '-' || v_round || '-' || v_easel || '/bids',
          '/live/event/' || v_event_eid
        ),
        'art_id', NEW.art_id,
        'amount', NEW.amount,
        'timestamp', EXTRACT(EPOCH FROM NOW()),
        'cache_version', v_cache_version
      );
    WHEN 'payment_processing' THEN
      -- NEW: Handle payment status changes
      v_notification_payload := jsonb_build_object(
        'type', 'payment_status_changed',
        'event_eid', v_event_eid,
        'endpoints', jsonb_build_array('/live/event/' || v_event_eid),
        'art_id', NEW.art_id,
        'payment_status', NEW.status,
        'payment_amount', NEW.amount_with_tax,
        'round', v_round,
        'easel', v_easel,
        'timestamp', EXTRACT(EPOCH FROM NOW()),
        'cache_version', v_cache_version
      );
    WHEN 'art_media' THEN
      v_notification_payload := jsonb_build_object(
        'type', 'media_updated',
        'event_eid', v_event_eid,
        'endpoints', jsonb_build_array(
          '/live/event/' || v_event_eid || '/media',
          '/live/event/' || v_event_eid  -- FIXED: Also invalidate main endpoint
        ),
        'art_id', NEW.art_id,
        'round', v_round,  -- Add round info for better targeting
        'easel', v_easel,  -- Add easel info for better targeting
        'timestamp', EXTRACT(EPOCH FROM NOW()),
        'cache_version', v_cache_version
      );
    WHEN 'votes' THEN
      v_notification_payload := jsonb_build_object(
        'type', 'vote_cast',
        'event_eid', v_event_eid,
        'endpoints', jsonb_build_array('/live/event/' || v_event_eid),
        'art_id', NEW.art_uuid,
        'timestamp', EXTRACT(EPOCH FROM NOW()),
        'cache_version', v_cache_version
      );
    WHEN 'event_artists' THEN
      v_notification_payload := jsonb_build_object(
        'type', 'event_artists_updated',
        'event_eid', v_event_eid,
        'endpoints', jsonb_build_array(
          '/live/event/' || v_event_eid,
          '/live/event/' || v_event_eid || '/artists'
        ),
        'artist_id', v_artist_id,
        'timestamp', EXTRACT(EPOCH FROM NOW()),
        'cache_version', v_cache_version
      );
    WHEN 'round_contestants' THEN
      v_notification_payload := jsonb_build_object(
        'type', 'round_contestants_updated',
        'event_eid', v_event_eid,
        'endpoints', jsonb_build_array(
          '/live/event/' || v_event_eid,
          '/live/event/' || v_event_eid || '/artists'
        ),
        'artist_id', v_artist_id,
        'round', v_round,
        'timestamp', EXTRACT(EPOCH FROM NOW()),
        'cache_version', v_cache_version
      );
    WHEN 'artwork_offers' THEN
      -- NEW: Handle artwork offers (payment notifications)
      v_notification_payload := jsonb_build_object(
        'type', 'artwork_offer_updated',
        'event_eid', v_event_eid,
        'endpoints', jsonb_build_array('/live/event/' || v_event_eid),
        'art_id', COALESCE(NEW.art_id, OLD.art_id),
        'offer_id', COALESCE(NEW.id, OLD.id),
        'status', COALESCE(NEW.status, OLD.status),
        'timestamp', EXTRACT(EPOCH FROM NOW()),
        'cache_version', v_cache_version
      );
    WHEN 'events' THEN
      -- NEW: Handle event changes (auction closure)
      v_notification_payload := jsonb_build_object(
        'type', 'event_status_changed',
        'event_eid', v_event_eid,
        'endpoints', jsonb_build_array('/live/event/' || v_event_eid),
        'timestamp', EXTRACT(EPOCH FROM NOW()),
        'cache_version', v_cache_version
      );
  END CASE;

  -- Send the realtime notification using CORRECT FORMAT (4 parameters)
  BEGIN
    PERFORM realtime.send(
      v_notification_payload,                    -- payload (JSONB)
      'cache_invalidation',                      -- event name
      'cache_invalidate_' || v_event_eid,        -- topic/channel name
      false                                      -- public flag
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- Log error but don't fail the trigger
      RAISE NOTICE 'Cache invalidation broadcast failed: %', SQLERRM;
  END;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Step 3: Log migration completion
INSERT INTO system_logs (service, operation, level, message, request_data)
VALUES (
  'migration',
  'fix_photo_upload_disappearing_easel',
  'info',
  'Added safety checks and delays for photo uploads on recently created art',
  jsonb_build_object(
    'migration_file', '20250926_fix_photo_upload_disappearing_easel.sql',
    'applied_at', NOW()::text,
    'changes', jsonb_build_array(
      'Added delay for media broadcasts on recent art',
      'Skip main event broadcasts for recent art_media operations',
      'Enhanced logging for debugging timing issues'
    )
  )
);