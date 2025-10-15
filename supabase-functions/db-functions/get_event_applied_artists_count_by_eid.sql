                                  pg_get_functiondef                                  
--------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_event_applied_artists_count_by_eid(p_eid text)+
  RETURNS integer                                                                    +
  LANGUAGE plpgsql                                                                   +
  STABLE SECURITY DEFINER                                                            +
 AS $function$                                                                       +
 BEGIN                                                                               +
   RETURN (                                                                          +
     SELECT COUNT(*)::INTEGER                                                        +
     FROM artist_confirmations                                                       +
     WHERE event_eid = p_eid                                                         +
   );                                                                                +
 END;                                                                                +
 $function$                                                                          +
 
(1 row)

