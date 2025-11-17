                             pg_get_functiondef                              
-----------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.count_qr_scans_by_event(event_ids uuid[])+
  RETURNS TABLE(event_id uuid, count bigint)                                +
  LANGUAGE sql                                                              +
  STABLE                                                                    +
 AS $function$                                                              +
   SELECT event_id, COUNT(*)::bigint as count                               +
   FROM people_qr_scans                                                     +
   WHERE event_id = ANY(event_ids)                                          +
     AND is_valid = true                                                    +
   GROUP BY event_id;                                                       +
 $function$                                                                 +
 
(1 row)

