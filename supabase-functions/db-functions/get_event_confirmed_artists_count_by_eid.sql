                                   pg_get_functiondef                                   
----------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_event_confirmed_artists_count_by_eid(p_eid text)+
  RETURNS integer                                                                      +
  LANGUAGE plpgsql                                                                     +
  STABLE SECURITY DEFINER                                                              +
 AS $function$                                                                         +
 BEGIN                                                                                 +
   RETURN (                                                                            +
     SELECT COUNT(*)::INTEGER                                                          +
     FROM artist_confirmations                                                         +
     WHERE event_eid = p_eid                                                           +
       AND confirmation_status = 'confirmed'                                           +
       AND withdrawn_at IS NULL                                                        +
   );                                                                                  +
 END;                                                                                  +
 $function$                                                                            +
 
(1 row)

