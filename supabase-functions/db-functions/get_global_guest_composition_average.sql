                                        pg_get_functiondef                                         
---------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_global_guest_composition_average(p_event_id uuid)          +
  RETURNS TABLE(guest_category text, avg_guest_pct numeric)                                       +
  LANGUAGE plpgsql                                                                                +
 AS $function$                                                                                    +
 BEGIN                                                                                            +
     RETURN QUERY                                                                                 +
     WITH events_with_participants AS (                                                           +
         SELECT DISTINCT e.id, e.event_start_datetime                                             +
         FROM events e                                                                            +
         WHERE e.id != p_event_id                                                                 +
           AND e.event_start_datetime IS NOT NULL                                                 +
           AND (                                                                                  +
             EXISTS(SELECT 1 FROM people_qr_scans pqs WHERE pqs.event_id = e.id)                  +
             OR EXISTS(SELECT 1 FROM votes v WHERE v.event_id = e.id)                             +
             OR EXISTS(SELECT 1 FROM bids b JOIN art a ON b.art_id = a.id WHERE a.event_id = e.id)+
           )                                                                                      +
         ORDER BY e.event_start_datetime DESC                                                     +
         LIMIT 50  -- Look at more events to find ones with data                                  +
     ),                                                                                           +
     recent_global_events AS (                                                                    +
         SELECT id FROM events_with_participants LIMIT 10                                         +
     ),                                                                                           +
     global_compositions AS (                                                                     +
         SELECT                                                                                   +
             rge.id as event_id,                                                                  +
             comp.*                                                                               +
         FROM recent_global_events rge                                                            +
         CROSS JOIN LATERAL (                                                                     +
             SELECT * FROM get_event_guest_composition(rge.id)                                    +
         ) comp                                                                                   +
     )                                                                                            +
     SELECT                                                                                       +
         gc.guest_category::text,                                                                 +
         CASE                                                                                     +
             WHEN SUM(gc.guests) > 0 THEN                                                         +
                 ROUND(SUM(gc.guests) * 100.0 / SUM(SUM(gc.guests)) OVER (), 1)                   +
             ELSE 0                                                                               +
         END::numeric as avg_guest_pct                                                            +
     FROM global_compositions gc                                                                  +
     GROUP BY gc.guest_category                                                                   +
     ORDER BY                                                                                     +
         CASE gc.guest_category                                                                   +
             WHEN 'QR Scan (New)' THEN 1                                                          +
             WHEN 'QR Scan (Return)' THEN 2                                                       +
             WHEN 'Online (New)' THEN 3                                                           +
             WHEN 'Online (Return)' THEN 4                                                        +
             ELSE 5                                                                               +
         END;                                                                                     +
 END;                                                                                             +
 $function$                                                                                       +
 
(1 row)

