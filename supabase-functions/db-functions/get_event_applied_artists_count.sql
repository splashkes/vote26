                                 pg_get_functiondef                                 
------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_event_applied_artists_count(p_event_id uuid)+
  RETURNS integer                                                                  +
  LANGUAGE plpgsql                                                                 +
  STABLE SECURITY DEFINER                                                          +
 AS $function$                                                                     +
 BEGIN                                                                             +
   RETURN (                                                                        +
     SELECT COUNT(*)::INTEGER                                                      +
     FROM artist_confirmations ac                                                  +
     INNER JOIN events e ON ac.event_eid = e.eid                                   +
     WHERE e.id = p_event_id                                                       +
   );                                                                              +
 END;                                                                              +
 $function$                                                                        +
 
(1 row)

