                                                 pg_get_functiondef                                                 
--------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_events_without_city_with_registrations(min_registrations integer DEFAULT 10)+
  RETURNS TABLE(id uuid, name text, event_start_datetime timestamp with time zone, registration_count bigint)      +
  LANGUAGE plpgsql                                                                                                 +
 AS $function$                                                                                                     +
 BEGIN                                                                                                             +
   RETURN QUERY                                                                                                    +
   SELECT                                                                                                          +
     e.id,                                                                                                         +
     e.name,                                                                                                       +
     e.event_start_datetime,                                                                                       +
     COUNT(er.id) as registration_count                                                                            +
   FROM events e                                                                                                   +
   LEFT JOIN event_registrations er ON e.id = er.event_id                                                          +
   WHERE e.city_id IS NULL                                                                                         +
   GROUP BY e.id, e.name, e.event_start_datetime                                                                   +
   HAVING COUNT(er.id) > min_registrations                                                                         +
   ORDER BY e.event_start_datetime DESC;                                                                           +
 END;                                                                                                              +
 $function$                                                                                                        +
 
(1 row)

