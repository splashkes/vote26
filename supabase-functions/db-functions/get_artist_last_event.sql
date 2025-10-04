                                                       pg_get_functiondef                                                       
--------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_artist_last_event(p_entry_id integer)                                                   +
  RETURNS TABLE(event_eid text, event_name text, city_name text, event_date timestamp with time zone, days_since_event integer)+
  LANGUAGE plpgsql                                                                                                             +
  STABLE SECURITY DEFINER                                                                                                      +
 AS $function$                                                                                                                 +
 BEGIN                                                                                                                         +
   RETURN QUERY                                                                                                                +
   SELECT                                                                                                                      +
     e.eid::TEXT,                                                                                                              +
     e.name::TEXT,                                                                                                             +
     c.name::TEXT,                                                                                                             +
     e.event_start_datetime,                                                                                                   +
     EXTRACT(DAY FROM (NOW() - e.event_start_datetime))::INTEGER                                                               +
   FROM artist_profiles ap                                                                                                     +
   JOIN round_contestants rc ON ap.id = rc.artist_id                                                                           +
   JOIN rounds r ON rc.round_id = r.id                                                                                         +
   JOIN events e ON r.event_id = e.id                                                                                          +
   LEFT JOIN cities c ON e.city_id = c.id                                                                                      +
   WHERE ap.entry_id = p_entry_id                                                                                              +
   ORDER BY e.event_start_datetime DESC                                                                                        +
   LIMIT 1;                                                                                                                    +
 END;                                                                                                                          +
 $function$                                                                                                                    +
 
(1 row)

