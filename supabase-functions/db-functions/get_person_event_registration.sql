                                                                           pg_get_functiondef                                                                           
------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_person_event_registration(p_person_id uuid, p_event_id uuid)                                                                    +
  RETURNS TABLE(registration_id uuid, registration_type character varying, registration_source character varying, registered_at timestamp with time zone, qr_code text)+
  LANGUAGE plpgsql                                                                                                                                                     +
  SECURITY DEFINER                                                                                                                                                     +
 AS $function$                                                                                                                                                         +
 BEGIN                                                                                                                                                                 +
     RETURN QUERY                                                                                                                                                      +
     SELECT                                                                                                                                                            +
         er.id,                                                                                                                                                        +
         er.registration_type,                                                                                                                                         +
         er.registration_source,                                                                                                                                       +
         er.registered_at,                                                                                                                                             +
         er.qr_code                                                                                                                                                    +
     FROM event_registrations er                                                                                                                                       +
     WHERE er.person_id = p_person_id                                                                                                                                  +
       AND er.event_id = p_event_id;                                                                                                                                   +
 END;                                                                                                                                                                  +
 $function$                                                                                                                                                            +
 
(1 row)

