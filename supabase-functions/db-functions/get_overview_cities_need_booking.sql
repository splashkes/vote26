                                     pg_get_functiondef                                     
--------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_overview_cities_need_booking()                      +
  RETURNS jsonb                                                                            +
  LANGUAGE plpgsql                                                                         +
  STABLE SECURITY DEFINER                                                                  +
 AS $function$                                                                             +
 DECLARE                                                                                   +
   count_cities INTEGER;                                                                   +
   result JSONB;                                                                           +
 BEGIN                                                                                     +
   WITH city_performance AS (                                                              +
     SELECT                                                                                +
       e.city_id,                                                                          +
       AVG(eac.ticket_revenue) as avg_revenue,                                             +
       COUNT(*) as event_count                                                             +
     FROM events e                                                                         +
     LEFT JOIN eventbrite_api_cache eac ON e.eid = eac.eid                                 +
     WHERE e.event_start_datetime < NOW()                                                  +
       AND e.event_start_datetime > NOW() - INTERVAL '2 years'                             +
     GROUP BY e.city_id                                                                    +
     HAVING AVG(eac.ticket_revenue) > 1000                                                 +
   ),                                                                                      +
   future_bookings AS (                                                                    +
     SELECT DISTINCT city_id                                                               +
     FROM events                                                                           +
     WHERE event_start_datetime > NOW()                                                    +
   )                                                                                       +
   SELECT COUNT(DISTINCT cp.city_id)                                                       +
   INTO count_cities                                                                       +
   FROM city_performance cp                                                                +
   WHERE cp.city_id NOT IN (SELECT city_id FROM future_bookings WHERE city_id IS NOT NULL);+
                                                                                           +
   result := jsonb_build_object(                                                           +
     'count', count_cities,                                                                +
     'metric_type', 'cities_need_booking'                                                  +
   );                                                                                      +
                                                                                           +
   RETURN result;                                                                          +
 END;                                                                                      +
 $function$                                                                                +
 
(1 row)

