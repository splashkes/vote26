                                                    pg_get_functiondef                                                    
--------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_events_with_people_counts_by_city(p_city_id uuid, p_min_people integer DEFAULT 10)+
  RETURNS TABLE(id uuid, name text, event_start_datetime timestamp with time zone, people_count bigint)                  +
  LANGUAGE sql                                                                                                           +
  SECURITY DEFINER                                                                                                       +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                                        +
 AS $function$                                                                                                           +
   SELECT                                                                                                                +
     e.id,                                                                                                               +
     e.name,                                                                                                             +
     e.event_start_datetime,                                                                                             +
     COUNT(DISTINCT people.person_id) as people_count                                                                    +
   FROM events e                                                                                                         +
   LEFT JOIN LATERAL (                                                                                                   +
     -- Get people from registrations                                                                                    +
     SELECT er.person_id                                                                                                 +
     FROM event_registrations er                                                                                         +
     WHERE er.event_id = e.id                                                                                            +
                                                                                                                         +
     UNION                                                                                                               +
                                                                                                                         +
     -- Get people from QR scans                                                                                         +
     SELECT pqs.person_id                                                                                                +
     FROM people_qr_scans pqs                                                                                            +
     WHERE pqs.event_id = e.id                                                                                           +
     AND pqs.is_valid = true                                                                                             +
   ) people ON true                                                                                                      +
   WHERE e.city_id = p_city_id                                                                                           +
   GROUP BY e.id, e.name, e.event_start_datetime                                                                         +
   HAVING COUNT(DISTINCT people.person_id) >= p_min_people                                                               +
   ORDER BY e.event_start_datetime DESC;                                                                                 +
 $function$                                                                                                              +
 
(1 row)

