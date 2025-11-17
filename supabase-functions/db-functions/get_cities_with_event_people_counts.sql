                                          pg_get_functiondef                                           
-------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_cities_with_event_people_counts(p_min_people integer DEFAULT 1)+
  RETURNS TABLE(city_id uuid, city_name text, event_count bigint)                                     +
  LANGUAGE sql                                                                                        +
  SECURITY DEFINER                                                                                    +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                     +
 AS $function$                                                                                        +
   SELECT                                                                                             +
     c.id as city_id,                                                                                 +
     c.name as city_name,                                                                             +
     COUNT(DISTINCT e.id) as event_count                                                              +
   FROM cities c                                                                                      +
   JOIN events e ON e.city_id = c.id                                                                  +
   WHERE EXISTS (                                                                                     +
     SELECT 1                                                                                         +
     FROM (                                                                                           +
       SELECT er.person_id FROM event_registrations er WHERE er.event_id = e.id                       +
       UNION                                                                                          +
       SELECT pqs.person_id FROM people_qr_scans pqs WHERE pqs.event_id = e.id AND pqs.is_valid = true+
     ) people                                                                                         +
     GROUP BY e.id                                                                                    +
     HAVING COUNT(*) >= p_min_people                                                                  +
   )                                                                                                  +
   GROUP BY c.id, c.name                                                                              +
   HAVING COUNT(DISTINCT e.id) > 0                                                                    +
   ORDER BY event_count DESC;                                                                         +
 $function$                                                                                           +
 
(1 row)

