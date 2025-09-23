                                                          pg_get_functiondef                                                           
---------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_event_guest_composition(p_event_id uuid)                                                       +
  RETURNS TABLE(guest_category text, guests bigint, guest_pct numeric, votes bigint, vote_rate numeric, bids bigint, bid_rate numeric)+
  LANGUAGE plpgsql                                                                                                                    +
 AS $function$                                                                                                                        +
 BEGIN                                                                                                                                +
     RETURN QUERY                                                                                                                     +
     WITH event_participants AS (                                                                                                     +
         SELECT DISTINCT                                                                                                              +
             p.id,                                                                                                                    +
             -- Current event activities                                                                                              +
             CASE WHEN EXISTS(SELECT 1 FROM votes v WHERE v.person_id = p.id AND v.event_id = p_event_id)                             +
                  THEN 1 ELSE 0 END as voted_event,                                                                                   +
             CASE WHEN EXISTS(SELECT 1 FROM bids b JOIN art a ON b.art_id = a.id WHERE b.person_id = p.id AND a.event_id = p_event_id)+
                  THEN 1 ELSE 0 END as bid_event,                                                                                     +
             CASE WHEN EXISTS(SELECT 1 FROM people_qr_scans pqs WHERE pqs.person_id = p.id AND pqs.event_id = p_event_id)             +
                  THEN 1 ELSE 0 END as scanned_event,                                                                                 +
             -- Check if they have previous event history                                                                             +
             CASE WHEN EXISTS(                                                                                                        +
                 SELECT 1 FROM votes v WHERE v.person_id = p.id AND v.event_id <> p_event_id                                          +
                 UNION                                                                                                                +
                 SELECT 1 FROM people_qr_scans pqs WHERE pqs.person_id = p.id AND pqs.event_id <> p_event_id                          +
                 UNION                                                                                                                +
                 SELECT 1 FROM bids b JOIN art a ON b.art_id = a.id WHERE b.person_id = p.id AND a.event_id <> p_event_id             +
             ) THEN 1 ELSE 0 END as has_previous_events                                                                               +
         FROM people p                                                                                                                +
         WHERE p.id IN (                                                                                                              +
             SELECT person_id FROM people_qr_scans WHERE event_id = p_event_id                                                        +
             UNION                                                                                                                    +
             SELECT person_id FROM votes WHERE event_id = p_event_id                                                                  +
             UNION                                                                                                                    +
             SELECT b.person_id FROM bids b JOIN art a ON b.art_id = a.id WHERE a.event_id = p_event_id                               +
         )                                                                                                                            +
     ),                                                                                                                               +
     classified_guests AS (                                                                                                           +
         SELECT *,                                                                                                                    +
             CASE                                                                                                                     +
                 WHEN scanned_event = 1 AND has_previous_events = 1 THEN 'QR Scan (Return)'                                           +
                 WHEN scanned_event = 1 AND has_previous_events = 0 THEN 'QR Scan (New)'                                              +
                 WHEN scanned_event = 0 AND has_previous_events = 1 THEN 'Online (Return)'                                            +
                 WHEN scanned_event = 0 AND has_previous_events = 0 THEN 'Online (New)'                                               +
                 ELSE 'Other'                                                                                                         +
             END as guest_type                                                                                                        +
         FROM event_participants                                                                                                      +
     )                                                                                                                                +
     SELECT                                                                                                                           +
         cg.guest_type::text,                                                                                                         +
         COUNT(*)::bigint,                                                                                                            +
         ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1)::numeric,                                                                 +
         SUM(cg.voted_event)::bigint,                                                                                                 +
         CASE WHEN COUNT(*) > 0 THEN ROUND(SUM(cg.voted_event) * 100.0 / COUNT(*), 1) ELSE 0 END::numeric,                            +
         SUM(cg.bid_event)::bigint,                                                                                                   +
         CASE WHEN COUNT(*) > 0 THEN ROUND(SUM(cg.bid_event) * 100.0 / COUNT(*), 1) ELSE 0 END::numeric                               +
     FROM classified_guests cg                                                                                                        +
     GROUP BY cg.guest_type                                                                                                           +
     ORDER BY                                                                                                                         +
         CASE cg.guest_type                                                                                                           +
             WHEN 'QR Scan (New)' THEN 1                                                                                              +
             WHEN 'QR Scan (Return)' THEN 2                                                                                           +
             WHEN 'Online (New)' THEN 3                                                                                               +
             WHEN 'Online (Return)' THEN 4                                                                                            +
             ELSE 5                                                                                                                   +
         END;                                                                                                                         +
 END;                                                                                                                                 +
 $function$                                                                                                                           +
 
(1 row)

