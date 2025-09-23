                                        pg_get_functiondef                                         
---------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_city_guest_composition_average(p_event_id uuid)            +
  RETURNS TABLE(guest_category text, avg_guest_pct numeric)                                       +
  LANGUAGE plpgsql                                                                                +
 AS $function$                                                                                    +
 DECLARE                                                                                          +
     event_venue text;                                                                            +
 BEGIN                                                                                            +
     -- Get the venue/city for the current event                                                  +
     SELECT venue INTO event_venue                                                                +
     FROM events                                                                                  +
     WHERE id = p_event_id;                                                                       +
                                                                                                  +
     -- If no venue found, return empty                                                           +
     IF event_venue IS NULL THEN                                                                  +
         RETURN;                                                                                  +
     END IF;                                                                                      +
                                                                                                  +
     RETURN QUERY                                                                                 +
     WITH events_with_participants_city AS (                                                      +
         SELECT DISTINCT e.id, e.event_start_datetime                                             +
         FROM events e                                                                            +
         WHERE e.venue = event_venue                                                              +
           AND e.id != p_event_id                                                                 +
           AND e.event_start_datetime IS NOT NULL                                                 +
           AND (                                                                                  +
             EXISTS(SELECT 1 FROM people_qr_scans pqs WHERE pqs.event_id = e.id)                  +
             OR EXISTS(SELECT 1 FROM votes v WHERE v.event_id = e.id)                             +
             OR EXISTS(SELECT 1 FROM bids b JOIN art a ON b.art_id = a.id WHERE a.event_id = e.id)+
           )                                                                                      +
         ORDER BY e.event_start_datetime DESC                                                     +
         LIMIT 20  -- Look at more events to find ones with data                                  +
     ),                                                                                           +
     recent_city_events AS (                                                                      +
         SELECT id FROM events_with_participants_city LIMIT 10                                    +
     ),                                                                                           +
     city_compositions AS (                                                                       +
         SELECT                                                                                   +
             rce.id as event_id,                                                                  +
             comp.*                                                                               +
         FROM recent_city_events rce                                                              +
         CROSS JOIN LATERAL (                                                                     +
             SELECT * FROM get_event_guest_composition(rce.id)                                    +
         ) comp                                                                                   +
     )                                                                                            +
     SELECT                                                                                       +
         cc.guest_category::text,                                                                 +
         CASE                                                                                     +
             WHEN SUM(cc.guests) > 0 THEN                                                         +
                 ROUND(SUM(cc.guests) * 100.0 / SUM(SUM(cc.guests)) OVER (), 1)                   +
             ELSE 0                                                                               +
         END::numeric as avg_guest_pct                                                            +
     FROM city_compositions cc                                                                    +
     GROUP BY cc.guest_category                                                                   +
     ORDER BY                                                                                     +
         CASE cc.guest_category                                                                   +
             WHEN 'QR Scan (New)' THEN 1                                                          +
             WHEN 'QR Scan (Return)' THEN 2                                                       +
             WHEN 'Online (New)' THEN 3                                                           +
             WHEN 'Online (Return)' THEN 4                                                        +
             ELSE 5                                                                               +
         END;                                                                                     +
 END;                                                                                             +
 $function$                                                                                       +
 
(1 row)

