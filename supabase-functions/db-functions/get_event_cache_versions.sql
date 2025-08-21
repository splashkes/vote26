                                    pg_get_functiondef                                     
-------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_event_cache_versions(p_event_eid character varying)+
  RETURNS TABLE(endpoint_path character varying, cache_version bigint)                    +
  LANGUAGE plpgsql                                                                        +
 AS $function$                                                                            +
 BEGIN                                                                                    +
   RETURN QUERY                                                                           +
   SELECT                                                                                 +
     ecv.endpoint_path,                                                                   +
     (EXTRACT(EPOCH FROM ecv.last_updated) * 1000)::BIGINT AS cache_version               +
   FROM endpoint_cache_versions ecv                                                       +
   WHERE ecv.event_eid = p_event_eid OR ecv.event_eid IS NULL                             +
   ORDER BY ecv.endpoint_path;                                                            +
 END;                                                                                     +
 $function$                                                                               +
 
(1 row)

