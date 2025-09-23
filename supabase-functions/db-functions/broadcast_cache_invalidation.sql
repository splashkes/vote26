                                                           pg_get_functiondef                                                            
-----------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.broadcast_cache_invalidation()                                                                       +
  RETURNS trigger                                                                                                                       +
  LANGUAGE plpgsql                                                                                                                      +
  SECURITY DEFINER                                                                                                                      +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions', 'realtime'                                                           +
 AS $function$                                                                                                                          +
 DECLARE                                                                                                                                +
   v_event_eid VARCHAR;                                                                                                                 +
   v_round INT;                                                                                                                         +
   v_easel VARCHAR;                                                                                                                     +
   v_notification_payload JSONB;                                                                                                        +
   v_endpoint_path VARCHAR;                                                                                                             +
   v_cache_version BIGINT;                                                                                                              +
   v_artist_id UUID;                                                                                                                    +
 BEGIN                                                                                                                                  +
   -- Add support for payment_processing table                                                                                          +
   IF TG_TABLE_NAME = 'art' THEN                                                                                                        +
     SELECT e.eid, NEW.round, NEW.easel INTO v_event_eid, v_round, v_easel                                                              +
     FROM events e WHERE e.id = NEW.event_id;                                                                                           +
   ELSIF TG_TABLE_NAME = 'votes' THEN                                                                                                   +
     SELECT e.eid, a.round, a.easel INTO v_event_eid, v_round, v_easel                                                                  +
     FROM art a JOIN events e ON e.id = a.event_id                                                                                      +
     WHERE a.id = NEW.art_uuid;                                                                                                         +
   ELSIF TG_TABLE_NAME = 'bids' THEN                                                                                                    +
     SELECT e.eid, a.round, a.easel INTO v_event_eid, v_round, v_easel                                                                  +
     FROM art a JOIN events e ON e.id = a.event_id                                                                                      +
     WHERE a.id = NEW.art_id;                                                                                                           +
   ELSIF TG_TABLE_NAME = 'art_media' THEN                                                                                               +
     SELECT e.eid, a.round, a.easel INTO v_event_eid, v_round, v_easel                                                                  +
     FROM art a JOIN events e ON e.id = a.event_id                                                                                      +
     WHERE a.id = NEW.art_id;                                                                                                           +
   ELSIF TG_TABLE_NAME = 'payment_processing' THEN                                                                                      +
     -- NEW: Handle payment_processing table                                                                                            +
     SELECT e.eid, a.round, a.easel INTO v_event_eid, v_round, v_easel                                                                  +
     FROM art a JOIN events e ON e.id = a.event_id                                                                                      +
     WHERE a.id = NEW.art_id;                                                                                                           +
   ELSIF TG_TABLE_NAME = 'event_artists' THEN                                                                                           +
     SELECT e.eid INTO v_event_eid                                                                                                      +
     FROM events e WHERE e.id = COALESCE(NEW.event_id, OLD.event_id);                                                                   +
     v_artist_id := COALESCE(NEW.artist_id, OLD.artist_id);                                                                             +
   ELSIF TG_TABLE_NAME = 'round_contestants' THEN                                                                                       +
     SELECT e.eid, r.round_number INTO v_event_eid, v_round                                                                             +
     FROM rounds r JOIN events e ON r.event_id = e.id                                                                                   +
     WHERE r.id = COALESCE(NEW.round_id, OLD.round_id);                                                                                 +
     v_artist_id := COALESCE(NEW.artist_id, OLD.artist_id);                                                                             +
   END IF;                                                                                                                              +
                                                                                                                                        +
   IF v_event_eid IS NULL THEN                                                                                                          +
     RETURN COALESCE(NEW, OLD);                                                                                                         +
   END IF;                                                                                                                              +
                                                                                                                                        +
   -- Update cache versions                                                                                                             +
   CASE TG_TABLE_NAME                                                                                                                   +
     WHEN 'art' THEN                                                                                                                    +
       PERFORM update_endpoint_cache_version('/live/event/' || v_event_eid, v_event_eid);                                               +
       PERFORM update_endpoint_cache_version('/live/event/' || v_event_eid || '/media', v_event_eid);                                   +
     WHEN 'votes' THEN                                                                                                                  +
       PERFORM update_endpoint_cache_version('/live/event/' || v_event_eid, v_event_eid);                                               +
     WHEN 'bids' THEN                                                                                                                   +
       -- ONLY update the specific bid endpoint, not the main event endpoint to preserve media                                          +
       PERFORM update_endpoint_cache_version('/live/event/' || v_event_eid || '-' || v_round || '-' || v_easel || '/bids', v_event_eid);+
     WHEN 'art_media' THEN                                                                                                              +
       PERFORM update_endpoint_cache_version('/live/event/' || v_event_eid || '/media', v_event_eid);                                   +
     WHEN 'payment_processing' THEN                                                                                                     +
       -- NEW: Update main event endpoint for payment status changes                                                                    +
       PERFORM update_endpoint_cache_version('/live/event/' || v_event_eid, v_event_eid);                                               +
     WHEN 'event_artists' THEN                                                                                                          +
       PERFORM update_endpoint_cache_version('/live/event/' || v_event_eid, v_event_eid);                                               +
       PERFORM update_endpoint_cache_version('/live/event/' || v_event_eid || '/artists', v_event_eid);                                 +
     WHEN 'round_contestants' THEN                                                                                                      +
       PERFORM update_endpoint_cache_version('/live/event/' || v_event_eid, v_event_eid);                                               +
       PERFORM update_endpoint_cache_version('/live/event/' || v_event_eid || '/artists', v_event_eid);                                 +
   END CASE;                                                                                                                            +
                                                                                                                                        +
   v_cache_version := EXTRACT(EPOCH FROM NOW()) * 1000;                                                                                 +
                                                                                                                                        +
   -- Build payload (adding payment_processing case)                                                                                    +
   CASE TG_TABLE_NAME                                                                                                                   +
     WHEN 'art' THEN                                                                                                                    +
       v_notification_payload := jsonb_build_object(                                                                                    +
         'type', 'art_updated',                                                                                                         +
         'event_eid', v_event_eid,                                                                                                      +
         'endpoints', jsonb_build_array(                                                                                                +
           '/live/event/' || v_event_eid,                                                                                               +
           '/live/event/' || v_event_eid || '/media'                                                                                    +
         ),                                                                                                                             +
         'art_id', NEW.id,                                                                                                              +
         'round', v_round,                                                                                                              +
         'easel', v_easel,                                                                                                              +
         'timestamp', EXTRACT(EPOCH FROM NOW()),                                                                                        +
         'cache_version', v_cache_version                                                                                               +
       );                                                                                                                               +
     WHEN 'bids' THEN                                                                                                                   +
       v_notification_payload := jsonb_build_object(                                                                                    +
         'type', 'bid_placed',                                                                                                          +
         'event_eid', v_event_eid,                                                                                                      +
         'endpoints', jsonb_build_array('/live/event/' || v_event_eid || '-' || v_round || '-' || v_easel || '/bids'),                  +
         'art_id', NEW.art_id,                                                                                                          +
         'amount', NEW.amount,                                                                                                          +
         'timestamp', EXTRACT(EPOCH FROM NOW()),                                                                                        +
         'cache_version', v_cache_version                                                                                               +
       );                                                                                                                               +
     WHEN 'payment_processing' THEN                                                                                                     +
       -- NEW: Handle payment status changes                                                                                            +
       v_notification_payload := jsonb_build_object(                                                                                    +
         'type', 'payment_status_changed',                                                                                              +
         'event_eid', v_event_eid,                                                                                                      +
         'endpoints', jsonb_build_array('/live/event/' || v_event_eid),                                                                 +
         'art_id', NEW.art_id,                                                                                                          +
         'payment_status', NEW.status,                                                                                                  +
         'payment_amount', NEW.amount_with_tax,                                                                                         +
         'round', v_round,                                                                                                              +
         'easel', v_easel,                                                                                                              +
         'timestamp', EXTRACT(EPOCH FROM NOW()),                                                                                        +
         'cache_version', v_cache_version                                                                                               +
       );                                                                                                                               +
     WHEN 'art_media' THEN                                                                                                              +
       v_notification_payload := jsonb_build_object(                                                                                    +
         'type', 'media_updated',                                                                                                       +
         'event_eid', v_event_eid,                                                                                                      +
         'endpoints', jsonb_build_array('/live/event/' || v_event_eid || '/media'),                                                     +
         'art_id', NEW.art_id,                                                                                                          +
         'timestamp', EXTRACT(EPOCH FROM NOW()),                                                                                        +
         'cache_version', v_cache_version                                                                                               +
       );                                                                                                                               +
     WHEN 'votes' THEN                                                                                                                  +
       v_notification_payload := jsonb_build_object(                                                                                    +
         'type', 'vote_cast',                                                                                                           +
         'event_eid', v_event_eid,                                                                                                      +
         'endpoints', jsonb_build_array('/live/event/' || v_event_eid),                                                                 +
         'art_id', NEW.art_uuid,                                                                                                        +
         'timestamp', EXTRACT(EPOCH FROM NOW()),                                                                                        +
         'cache_version', v_cache_version                                                                                               +
       );                                                                                                                               +
     WHEN 'event_artists' THEN                                                                                                          +
       v_notification_payload := jsonb_build_object(                                                                                    +
         'type', 'event_artists_updated',                                                                                               +
         'event_eid', v_event_eid,                                                                                                      +
         'endpoints', jsonb_build_array(                                                                                                +
           '/live/event/' || v_event_eid,                                                                                               +
           '/live/event/' || v_event_eid || '/artists'                                                                                  +
         ),                                                                                                                             +
         'artist_id', v_artist_id,                                                                                                      +
         'timestamp', EXTRACT(EPOCH FROM NOW()),                                                                                        +
         'cache_version', v_cache_version                                                                                               +
       );                                                                                                                               +
     WHEN 'round_contestants' THEN                                                                                                      +
       v_notification_payload := jsonb_build_object(                                                                                    +
         'type', 'round_contestants_updated',                                                                                           +
         'event_eid', v_event_eid,                                                                                                      +
         'endpoints', jsonb_build_array(                                                                                                +
           '/live/event/' || v_event_eid,                                                                                               +
           '/live/event/' || v_event_eid || '/artists'                                                                                  +
         ),                                                                                                                             +
         'artist_id', v_artist_id,                                                                                                      +
         'round', v_round,                                                                                                              +
         'timestamp', EXTRACT(EPOCH FROM NOW()),                                                                                        +
         'cache_version', v_cache_version                                                                                               +
       );                                                                                                                               +
   END CASE;                                                                                                                            +
                                                                                                                                        +
   -- Send the realtime notification                                                                                                    +
   BEGIN                                                                                                                                +
     PERFORM realtime.send(                                                                                                             +
       jsonb_build_object(                                                                                                              +
         'channel', 'cache_invalidate_' || v_event_eid,                                                                                 +
         'event', 'cache_invalidation',                                                                                                 +
         'payload', v_notification_payload                                                                                              +
       )                                                                                                                                +
     );                                                                                                                                 +
   EXCEPTION                                                                                                                            +
     WHEN OTHERS THEN                                                                                                                   +
       -- Log error but don't fail the trigger                                                                                          +
       RAISE NOTICE 'Cache invalidation broadcast failed: %', SQLERRM;                                                                  +
   END;                                                                                                                                 +
                                                                                                                                        +
   RETURN COALESCE(NEW, OLD);                                                                                                           +
 END;                                                                                                                                   +
 $function$                                                                                                                             +
 
(1 row)

