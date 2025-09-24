                                       pg_get_functiondef                                       
------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_recent_contestants(cutoff_date timestamp with time zone)+
  RETURNS TABLE(artist_id uuid, city_name text, contest_count bigint)                          +
  LANGUAGE sql                                                                                 +
  SECURITY DEFINER                                                                             +
 AS $function$                                                                                 +
   SELECT                                                                                      +
     rc.artist_id,                                                                             +
     COALESCE(c.name, 'Unknown') as city_name,                                                 +
     COUNT(*) as contest_count                                                                 +
   FROM round_contestants rc                                                                   +
   JOIN rounds r ON rc.round_id = r.id                                                         +
   JOIN events e ON r.event_id = e.id                                                          +
   LEFT JOIN cities c ON e.city_id = c.id                                                      +
   WHERE e.event_start_datetime >= cutoff_date                                                 +
   GROUP BY rc.artist_id, c.name                                                               +
   ORDER BY rc.artist_id;                                                                      +
 $function$                                                                                    +
 
(1 row)

