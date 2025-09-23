                                              pg_get_functiondef                                              
--------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_guest_composition_with_comparisons(p_event_id uuid)                   +
  RETURNS TABLE(guest_category text, current_pct numeric, city_avg_pct numeric, global_avg_pct numeric)      +
  LANGUAGE plpgsql                                                                                           +
 AS $function$                                                                                               +
 BEGIN                                                                                                       +
     RETURN QUERY                                                                                            +
     WITH current_composition AS (                                                                           +
         SELECT                                                                                              +
             gc.guest_category,                                                                              +
             gc.guest_pct as current_pct                                                                     +
         FROM get_event_guest_composition(p_event_id) gc                                                     +
     ),                                                                                                      +
     city_averages AS (                                                                                      +
         SELECT                                                                                              +
             ca.guest_category,                                                                              +
             ca.avg_guest_pct as city_avg_pct                                                                +
         FROM get_city_guest_composition_average(p_event_id) ca                                              +
     ),                                                                                                      +
     global_averages AS (                                                                                    +
         SELECT                                                                                              +
             ga.guest_category,                                                                              +
             ga.avg_guest_pct as global_avg_pct                                                              +
         FROM get_global_guest_composition_average(p_event_id) ga                                            +
     )                                                                                                       +
     SELECT                                                                                                  +
         COALESCE(cc.guest_category, ca.guest_category, ga.guest_category)::text,                            +
         COALESCE(cc.current_pct, 0)::numeric,                                                               +
         COALESCE(ca.city_avg_pct, 0)::numeric,                                                              +
         COALESCE(ga.global_avg_pct, 0)::numeric                                                             +
     FROM current_composition cc                                                                             +
     FULL OUTER JOIN city_averages ca ON cc.guest_category = ca.guest_category                               +
     FULL OUTER JOIN global_averages ga ON COALESCE(cc.guest_category, ca.guest_category) = ga.guest_category+
     ORDER BY                                                                                                +
         CASE COALESCE(cc.guest_category, ca.guest_category, ga.guest_category)                              +
             WHEN 'QR Scan (New)' THEN 1                                                                     +
             WHEN 'QR Scan (Return)' THEN 2                                                                  +
             WHEN 'Online (New)' THEN 3                                                                      +
             WHEN 'Online (Return)' THEN 4                                                                   +
             ELSE 5                                                                                          +
         END;                                                                                                +
 END;                                                                                                        +
 $function$                                                                                                  +
 
(1 row)

