                           pg_get_functiondef                            
-------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.broadcast_events_cache_invalidation()+
  RETURNS trigger                                                       +
  LANGUAGE plpgsql                                                      +
 AS $function$                                                          +
 DECLARE                                                                +
   v_cache_version BIGINT;                                              +
 BEGIN                                                                  +
   -- Update events list endpoint                                       +
   PERFORM update_endpoint_cache_version('/live/events', NULL);         +
                                                                        +
   -- Get current cache version                                         +
   v_cache_version := EXTRACT(EPOCH FROM NOW()) * 1000;                 +
                                                                        +
   -- Broadcast events list update                                      +
   PERFORM realtime.send(                                               +
     jsonb_build_object(                                                +
       'type', 'events_updated',                                        +
       'endpoints', jsonb_build_array('/live/events'),                  +
       'timestamp', EXTRACT(EPOCH FROM NOW()),                          +
       'cache_version', v_cache_version                                 +
     ),                                                                 +
     'cache_invalidation',                                              +
     'cache_invalidate_events',                                         +
     false                                                              +
   );                                                                   +
                                                                        +
   RETURN COALESCE(NEW, OLD);                                           +
 END;                                                                   +
 $function$                                                             +
 
(1 row)

