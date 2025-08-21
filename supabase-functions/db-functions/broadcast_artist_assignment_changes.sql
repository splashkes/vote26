                                         pg_get_functiondef                                         
----------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.broadcast_artist_assignment_changes()                           +
  RETURNS trigger                                                                                  +
  LANGUAGE plpgsql                                                                                 +
 AS $function$                                                                                     +
 DECLARE                                                                                           +
   v_event_eid VARCHAR;                                                                            +
   v_notification_payload JSONB;                                                                   +
   v_cache_version BIGINT;                                                                         +
   v_artist_id UUID;                                                                               +
   v_round INT;                                                                                    +
 BEGIN                                                                                             +
   -- Get event EID based on table and operation                                                   +
   IF TG_TABLE_NAME = 'event_artists' THEN                                                         +
     SELECT e.eid INTO v_event_eid                                                                 +
     FROM events e WHERE e.id = COALESCE(NEW.event_id, OLD.event_id);                              +
     v_artist_id := COALESCE(NEW.artist_id, OLD.artist_id);                                        +
   ELSIF TG_TABLE_NAME = 'round_contestants' THEN                                                  +
     SELECT e.eid, r.round_number INTO v_event_eid, v_round                                        +
     FROM rounds r JOIN events e ON r.event_id = e.id                                              +
     WHERE r.id = COALESCE(NEW.round_id, OLD.round_id);                                            +
     v_artist_id := COALESCE(NEW.artist_id, OLD.artist_id);                                        +
   END IF;                                                                                         +
                                                                                                   +
   -- Only proceed if we have an event EID                                                         +
   IF v_event_eid IS NULL THEN                                                                     +
     RETURN COALESCE(NEW, OLD);                                                                    +
   END IF;                                                                                         +
                                                                                                   +
   -- Update cache versions for both main event and artists endpoints                              +
   PERFORM update_endpoint_cache_version('/live/event/' || v_event_eid, v_event_eid);              +
   PERFORM update_endpoint_cache_version('/live/event/' || v_event_eid || '/artists', v_event_eid);+
                                                                                                   +
   v_cache_version := EXTRACT(EPOCH FROM NOW()) * 1000;                                            +
                                                                                                   +
   -- Build payload based on table                                                                 +
   CASE TG_TABLE_NAME                                                                              +
     WHEN 'event_artists' THEN                                                                     +
       v_notification_payload := jsonb_build_object(                                               +
         'type', 'artists_updated',                                                                +
         'event_eid', v_event_eid,                                                                 +
         'endpoints', jsonb_build_array(                                                           +
           '/live/event/' || v_event_eid,                                                          +
           '/live/event/' || v_event_eid || '/artists'                                             +
         ),                                                                                        +
         'artist_id', v_artist_id,                                                                 +
         'operation', TG_OP,                                                                       +
         'timestamp', EXTRACT(EPOCH FROM NOW()),                                                   +
         'cache_version', v_cache_version                                                          +
       );                                                                                          +
     WHEN 'round_contestants' THEN                                                                 +
       v_notification_payload := jsonb_build_object(                                               +
         'type', 'round_contestants_updated',                                                      +
         'event_eid', v_event_eid,                                                                 +
         'endpoints', jsonb_build_array(                                                           +
           '/live/event/' || v_event_eid,                                                          +
           '/live/event/' || v_event_eid || '/artists'                                             +
         ),                                                                                        +
         'artist_id', v_artist_id,                                                                 +
         'round', v_round,                                                                         +
         'operation', TG_OP,                                                                       +
         'timestamp', EXTRACT(EPOCH FROM NOW()),                                                   +
         'cache_version', v_cache_version                                                          +
       );                                                                                          +
   END CASE;                                                                                       +
                                                                                                   +
   -- Use pg_notify instead of realtime.send                                                       +
   PERFORM pg_notify(                                                                              +
     'cache_invalidate_' || v_event_eid,                                                           +
     v_notification_payload::text                                                                  +
   );                                                                                              +
                                                                                                   +
   RETURN COALESCE(NEW, OLD);                                                                      +
 END;                                                                                              +
 $function$                                                                                        +
 
(1 row)

