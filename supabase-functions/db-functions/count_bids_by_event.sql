                           pg_get_functiondef                            
-------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.count_bids_by_event(event_ids uuid[])+
  RETURNS TABLE(event_id uuid, count bigint)                            +
  LANGUAGE sql                                                          +
  STABLE                                                                +
 AS $function$                                                          +
   SELECT a.event_id, COUNT(*)::bigint as count                         +
   FROM bids b                                                          +
   JOIN art a ON b.art_id = a.id                                        +
   WHERE a.event_id = ANY(event_ids)                                    +
   GROUP BY a.event_id;                                                 +
 $function$                                                             +
 
(1 row)

