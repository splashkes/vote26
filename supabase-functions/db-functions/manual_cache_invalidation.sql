                                                                    pg_get_functiondef                                                                    
----------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.manual_cache_invalidation(p_event_eid character varying, p_endpoint character varying DEFAULT NULL::character varying)+
  RETURNS void                                                                                                                                           +
  LANGUAGE plpgsql                                                                                                                                       +
 AS $function$                                                                                                                                           +
  DECLARE                                                                                                                                                +
    v_notification_payload JSONB;                                                                                                                        +
  BEGIN                                                                                                                                                  +
    v_notification_payload := jsonb_build_object(                                                                                                        +
      'type', 'manual_invalidation',                                                                                                                     +
      'event_eid', p_event_eid,                                                                                                                          +
      'endpoints', CASE                                                                                                                                  +
        WHEN p_endpoint IS NOT NULL THEN jsonb_build_array(p_endpoint)                                                                                   +
        ELSE jsonb_build_array(                                                                                                                          +
          '/live/event/' || p_event_eid,                                                                                                                 +
          '/live/event/' || p_event_eid || '/media'                                                                                                      +
        )                                                                                                                                                +
      END,                                                                                                                                               +
      'timestamp', EXTRACT(EPOCH FROM NOW())                                                                                                             +
    );                                                                                                                                                   +
                                                                                                                                                         +
    PERFORM pg_notify(                                                                                                                                   +
      'cache_invalidate_' || p_event_eid,                                                                                                                +
      v_notification_payload::text                                                                                                                       +
    );                                                                                                                                                   +
  END;                                                                                                                                                   +
  $function$                                                                                                                                             +
 
(1 row)

