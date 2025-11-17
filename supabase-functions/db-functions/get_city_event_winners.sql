                                                pg_get_functiondef                                                 
-------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_city_event_winners(p_city_id uuid)                                         +
  RETURNS TABLE(event_id uuid, champion_name text, champion_id uuid, champion_entry_id integer, rounds_data jsonb)+
  LANGUAGE sql                                                                                                    +
  SECURITY DEFINER                                                                                                +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                                 +
 AS $function$                                                                                                    +
   WITH event_rounds AS (                                                                                         +
     SELECT                                                                                                       +
       e.id as event_id,                                                                                          +
       r.round_number,                                                                                            +
       JSONB_AGG(                                                                                                 +
         JSONB_BUILD_OBJECT(                                                                                      +
           'name', ap.name,                                                                                       +
           'id', ap.id,                                                                                           +
           'entry_id', ap.entry_id                                                                                +
         ) ORDER BY ap.name                                                                                       +
       ) FILTER (WHERE rc.is_winner > 0) as winners                                                               +
     FROM events e                                                                                                +
     JOIN rounds r ON r.event_id = e.id                                                                           +
     LEFT JOIN round_contestants rc ON rc.round_id = r.id AND rc.is_winner > 0                                    +
     LEFT JOIN artist_profiles ap ON ap.id = rc.artist_id                                                         +
     WHERE e.city_id = p_city_id                                                                                  +
     AND e.event_start_datetime < NOW()                                                                           +
     GROUP BY e.id, r.round_number                                                                                +
   ),                                                                                                             +
   champion_data AS (                                                                                             +
     SELECT DISTINCT ON (e.id)                                                                                    +
       e.id as event_id,                                                                                          +
       ap.name as champion_name,                                                                                  +
       ap.id as champion_id,                                                                                      +
       ap.entry_id as champion_entry_id                                                                           +
     FROM events e                                                                                                +
     JOIN rounds r ON r.event_id = e.id                                                                           +
     JOIN round_contestants rc ON rc.round_id = r.id AND rc.is_winner > 0                                         +
     JOIN artist_profiles ap ON ap.id = rc.artist_id                                                              +
     WHERE e.city_id = p_city_id                                                                                  +
     AND e.event_start_datetime < NOW()                                                                           +
     ORDER BY e.id, r.round_number DESC                                                                           +
   )                                                                                                              +
   SELECT                                                                                                         +
     er.event_id,                                                                                                 +
     cd.champion_name,                                                                                            +
     cd.champion_id,                                                                                              +
     cd.champion_entry_id,                                                                                        +
     JSONB_AGG(                                                                                                   +
       JSONB_BUILD_OBJECT(                                                                                        +
         'round_number', er.round_number,                                                                         +
         'winners', er.winners                                                                                    +
       ) ORDER BY er.round_number                                                                                 +
     ) as rounds_data                                                                                             +
   FROM event_rounds er                                                                                           +
   LEFT JOIN champion_data cd ON cd.event_id = er.event_id                                                        +
   WHERE er.winners IS NOT NULL                                                                                   +
   GROUP BY er.event_id, cd.champion_name, cd.champion_id, cd.champion_entry_id;                                  +
 $function$                                                                                                       +
 
(1 row)

