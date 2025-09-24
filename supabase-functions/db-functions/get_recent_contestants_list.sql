                                                                               pg_get_functiondef                                                                               
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_recent_contestants_list(days_back integer)                                                                                              +
  RETURNS TABLE(artist_id uuid, artist_name text, artist_email text, artist_phone text, artist_entry_id integer, artist_country text, recent_contests bigint, recent_city text)+
  LANGUAGE sql                                                                                                                                                                 +
  SECURITY DEFINER                                                                                                                                                             +
 AS $function$                                                                                                                                                                 +
   WITH recent_event_info AS (                                                                                                                                                 +
     SELECT                                                                                                                                                                    +
       rc.artist_id,                                                                                                                                                           +
       c.name as event_city,                                                                                                                                                   +
       ROW_NUMBER() OVER (PARTITION BY rc.artist_id ORDER BY e.event_start_datetime DESC) as rn                                                                                +
     FROM round_contestants rc                                                                                                                                                 +
     JOIN rounds r ON rc.round_id = r.id                                                                                                                                       +
     JOIN events e ON r.event_id = e.id                                                                                                                                        +
     LEFT JOIN cities c ON e.city_id = c.id                                                                                                                                    +
     WHERE e.event_start_datetime >= NOW() - (days_back || ' days')::INTERVAL                                                                                                  +
   )                                                                                                                                                                           +
   SELECT                                                                                                                                                                      +
     ap.id as artist_id,                                                                                                                                                       +
     ap.name as artist_name,                                                                                                                                                   +
     ap.email as artist_email,                                                                                                                                                 +
     ap.phone as artist_phone,                                                                                                                                                 +
     ap.entry_id as artist_entry_id,                                                                                                                                           +
     ap.country as artist_country,                                                                                                                                             +
     COUNT(DISTINCT r.id) as recent_contests,                                                                                                                                  +
     rei.event_city as recent_city                                                                                                                                             +
   FROM round_contestants rc                                                                                                                                                   +
   JOIN rounds r ON rc.round_id = r.id                                                                                                                                         +
   JOIN events e ON r.event_id = e.id                                                                                                                                          +
   JOIN artist_profiles ap ON rc.artist_id = ap.id                                                                                                                             +
   LEFT JOIN recent_event_info rei ON ap.id = rei.artist_id AND rei.rn = 1                                                                                                     +
   WHERE e.event_start_datetime >= NOW() - (days_back || ' days')::INTERVAL                                                                                                    +
   GROUP BY ap.id, ap.name, ap.email, ap.phone, ap.entry_id, ap.country, rei.event_city                                                                                        +
   ORDER BY recent_contests DESC, ap.name;                                                                                                                                     +
 $function$                                                                                                                                                                    +
 
(1 row)

