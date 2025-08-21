                                                                        pg_get_functiondef                                                                         
-------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.update_endpoint_cache_version(p_endpoint_path character varying, p_event_eid character varying DEFAULT NULL::character varying)+
  RETURNS void                                                                                                                                                    +
  LANGUAGE plpgsql                                                                                                                                                +
 AS $function$                                                                                                                                                    +
 BEGIN                                                                                                                                                            +
   INSERT INTO endpoint_cache_versions (endpoint_path, last_updated, event_eid)                                                                                   +
   VALUES (p_endpoint_path, NOW(), p_event_eid)                                                                                                                   +
   ON CONFLICT (endpoint_path)                                                                                                                                    +
   DO UPDATE SET                                                                                                                                                  +
     last_updated = NOW(),                                                                                                                                        +
     event_eid = COALESCE(EXCLUDED.event_eid, endpoint_cache_versions.event_eid);                                                                                 +
 END;                                                                                                                                                             +
 $function$                                                                                                                                                       +
 
(1 row)

