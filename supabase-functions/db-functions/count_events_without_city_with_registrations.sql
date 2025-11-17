                                                  pg_get_functiondef                                                  
----------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.count_events_without_city_with_registrations(min_registrations integer DEFAULT 10)+
  RETURNS integer                                                                                                    +
  LANGUAGE plpgsql                                                                                                   +
 AS $function$                                                                                                       +
 DECLARE                                                                                                             +
   event_count INT;                                                                                                  +
 BEGIN                                                                                                               +
   SELECT COUNT(*)                                                                                                   +
   INTO event_count                                                                                                  +
   FROM (                                                                                                            +
     SELECT e.id                                                                                                     +
     FROM events e                                                                                                   +
     LEFT JOIN event_registrations er ON e.id = er.event_id                                                          +
     WHERE e.city_id IS NULL                                                                                         +
     GROUP BY e.id                                                                                                   +
     HAVING COUNT(er.id) > min_registrations                                                                         +
   ) subquery;                                                                                                       +
                                                                                                                     +
   RETURN COALESCE(event_count, 0);                                                                                  +
 END;                                                                                                                +
 $function$                                                                                                          +
 
(1 row)

