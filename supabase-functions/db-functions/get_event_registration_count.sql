                               pg_get_functiondef                                
---------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_event_registration_count(p_event_id uuid)+
  RETURNS integer                                                               +
  LANGUAGE plpgsql                                                              +
  SECURITY DEFINER                                                              +
 AS $function$                                                                  +
 BEGIN                                                                          +
     RETURN (                                                                   +
         SELECT COUNT(*)::INTEGER                                               +
         FROM event_registrations                                               +
         WHERE event_id = p_event_id                                            +
     );                                                                         +
 END;                                                                           +
 $function$                                                                     +
 
(1 row)

