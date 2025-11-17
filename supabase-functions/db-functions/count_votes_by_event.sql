                            pg_get_functiondef                            
--------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.count_votes_by_event(event_ids uuid[])+
  RETURNS TABLE(event_id uuid, count bigint)                             +
  LANGUAGE sql                                                           +
  STABLE                                                                 +
 AS $function$                                                           +
   SELECT event_id, COUNT(*)::bigint as count                            +
   FROM votes                                                            +
   WHERE event_id = ANY(event_ids)                                       +
   GROUP BY event_id;                                                    +
 $function$                                                              +
 
(1 row)

