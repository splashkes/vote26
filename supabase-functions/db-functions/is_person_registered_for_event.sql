                                         pg_get_functiondef                                          
-----------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.is_person_registered_for_event(p_person_id uuid, p_event_id uuid)+
  RETURNS boolean                                                                                   +
  LANGUAGE plpgsql                                                                                  +
  SECURITY DEFINER                                                                                  +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                   +
 AS $function$                                                                                      +
  BEGIN                                                                                             +
      RETURN EXISTS (                                                                               +
          SELECT 1                                                                                  +
          FROM event_registrations                                                                  +
          WHERE person_id = p_person_id                                                             +
            AND event_id = p_event_id                                                               +
      );                                                                                            +
  END;                                                                                              +
  $function$                                                                                        +
 
(1 row)

