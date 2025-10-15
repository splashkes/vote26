                                  pg_get_functiondef                                  
--------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_event_confirmed_artists_count(p_event_id uuid)+
  RETURNS integer                                                                    +
  LANGUAGE plpgsql                                                                   +
  STABLE SECURITY DEFINER                                                            +
 AS $function$                                                                       +
 BEGIN                                                                               +
   RETURN (                                                                          +
     SELECT COUNT(*)::INTEGER                                                        +
     FROM artist_confirmations ac                                                    +
     INNER JOIN events e ON ac.event_eid = e.eid                                     +
     WHERE e.id = p_event_id                                                         +
       AND ac.confirmation_status = 'confirmed'                                      +
       AND ac.withdrawn_at IS NULL                                                   +
   );                                                                                +
 END;                                                                                +
 $function$                                                                          +
 
(1 row)

