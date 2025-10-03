                            pg_get_functiondef                             
---------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_person_top_cities(p_person_id uuid)+
  RETURNS TABLE(city_name text, event_count bigint)                       +
  LANGUAGE plpgsql                                                        +
  SECURITY DEFINER                                                        +
 AS $function$                                                            +
 BEGIN                                                                    +
     RETURN QUERY                                                         +
     SELECT                                                               +
         e.city as city_name,                                             +
         COUNT(*) as event_count                                          +
     FROM votes v                                                         +
     JOIN art a ON v.art_id = a.id                                        +
     JOIN events e ON a.event_id = e.id                                   +
     WHERE v.person_id = p_person_id                                      +
       AND e.city IS NOT NULL                                             +
     GROUP BY e.city                                                      +
     ORDER BY event_count DESC, e.city ASC;                               +
 END;                                                                     +
 $function$                                                               +
 
(1 row)

