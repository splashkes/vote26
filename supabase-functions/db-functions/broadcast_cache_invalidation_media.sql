                                        pg_get_functiondef                                        
--------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.broadcast_cache_invalidation_media()                          +
  RETURNS trigger                                                                                +
  LANGUAGE plpgsql                                                                               +
  SECURITY DEFINER                                                                               +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions', 'realtime'                    +
 AS $function$                                                                                   +
 DECLARE                                                                                         +
   v_event_eid VARCHAR;                                                                          +
   v_round INT;                                                                                  +
   v_easel VARCHAR;                                                                              +
   v_notification_payload JSONB;                                                                 +
   v_cache_version BIGINT;                                                                       +
 BEGIN                                                                                           +
   -- Get event EID for art_media                                                                +
   SELECT e.eid, a.round, a.easel INTO v_event_eid, v_round, v_easel                             +
   FROM art a JOIN events e ON e.id = a.event_id                                                 +
   WHERE a.id = NEW.art_id;                                                                      +
                                                                                                 +
   -- Only proceed if we have an event EID                                                       +
   IF v_event_eid IS NULL THEN                                                                   +
     RETURN COALESCE(NEW, OLD);                                                                  +
   END IF;                                                                                       +
                                                                                                 +
   -- Update endpoint cache version                                                              +
   PERFORM update_endpoint_cache_version('/live/event/' || v_event_eid || '/media', v_event_eid);+
                                                                                                 +
   -- Get current cache version                                                                  +
   v_cache_version := EXTRACT(EPOCH FROM NOW()) * 1000;                                          +
                                                                                                 +
   -- Build payload                                                                              +
   v_notification_payload := jsonb_build_object(                                                 +
     'type', 'media_updated',                                                                    +
     'event_eid', v_event_eid,                                                                   +
     'endpoints', jsonb_build_array('/live/event/' || v_event_eid || '/media'),                  +
     'art_id', NEW.art_id,                                                                       +
     'round', v_round,                                                                           +
     'easel', v_easel,                                                                           +
     'timestamp', EXTRACT(EPOCH FROM NOW()),                                                     +
     'cache_version', v_cache_version                                                            +
   );                                                                                            +
                                                                                                 +
   -- Send realtime broadcast with SECURITY DEFINER privileges                                   +
   PERFORM realtime.send(                                                                        +
     v_notification_payload,                                                                     +
     'cache_invalidation',                                                                       +
     'cache_invalidate_' || v_event_eid,                                                         +
     false                                                                                       +
   );                                                                                            +
                                                                                                 +
   RETURN NEW;                                                                                   +
 END;                                                                                            +
 $function$                                                                                      +
 
(1 row)

