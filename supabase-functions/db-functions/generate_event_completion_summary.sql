                                  pg_get_functiondef                                  
--------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.generate_event_completion_summary(p_event_id uuid)+
  RETURNS void                                                                       +
  LANGUAGE plpgsql                                                                   +
 AS $function$                                                                       +
 DECLARE                                                                             +
   v_event_settings RECORD;                                                          +
   v_event_stats RECORD;                                                             +
   v_top_artists JSONB;                                                              +
   v_auction_stats JSONB;                                                            +
 BEGIN                                                                               +
   -- Get event settings                                                             +
   SELECT es.*, e.name as event_name, e.eid                                          +
   INTO v_event_settings                                                             +
   FROM event_slack_settings es                                                      +
   JOIN events e ON es.event_id = e.id                                               +
   WHERE es.event_id = p_event_id;                                                   +
                                                                                     +
   IF v_event_settings.channel_id IS NULL THEN                                       +
     RETURN;                                                                         +
   END IF;                                                                           +
                                                                                     +
   -- Get overall event statistics                                                   +
   WITH stats AS (                                                                   +
     SELECT                                                                          +
       COUNT(DISTINCT rc.artist_id) as total_artists,                                +
       COUNT(DISTINCT r.id) as total_rounds,                                         +
       COUNT(DISTINCT v.person_id) as total_voters,                                  +
       COUNT(v.id) as total_votes                                                    +
     FROM rounds r                                                                   +
     LEFT JOIN round_contestants rc ON rc.round_id = r.id                            +
     LEFT JOIN art a ON a.event_id = r.event_id                                      +
     LEFT JOIN votes v ON v.art_id = a.id                                            +
     WHERE r.event_id = p_event_id                                                   +
   )                                                                                 +
   SELECT * INTO v_event_stats FROM stats;                                           +
                                                                                     +
   -- Get top 3 artists by votes                                                     +
   SELECT jsonb_agg(                                                                 +
     jsonb_build_object(                                                             +
       'name', artist_name,                                                          +
       'votes', total_votes,                                                         +
       'rounds_won', rounds_won                                                      +
     ) ORDER BY total_votes DESC                                                     +
   ) INTO v_top_artists                                                              +
   FROM (                                                                            +
     SELECT                                                                          +
       ap.name as artist_name,                                                       +
       COUNT(v.id) as total_votes,                                                   +
       COUNT(DISTINCT rc.round_id) FILTER (WHERE rc.is_winner = 1) as rounds_won     +
     FROM artist_profiles ap                                                         +
     JOIN art a ON a.artist_id = ap.id                                               +
     LEFT JOIN votes v ON v.art_id = a.id                                            +
     LEFT JOIN round_contestants rc ON rc.artist_id = ap.id                          +
     WHERE a.event_id = p_event_id                                                   +
     GROUP BY ap.id                                                                  +
     ORDER BY total_votes DESC                                                       +
     LIMIT 3                                                                         +
   ) top_artists;                                                                    +
                                                                                     +
   -- Get auction statistics                                                         +
   v_auction_stats := get_auction_summary(p_event_id);                               +
                                                                                     +
   -- Create completion summary notification                                         +
   INSERT INTO slack_notifications (                                                 +
     event_id,                                                                       +
     channel_id,                                                                     +
     message_type,                                                                   +
     payload                                                                         +
   ) VALUES (                                                                        +
     p_event_id,                                                                     +
     v_event_settings.channel_id,                                                    +
     'event_complete',                                                               +
     jsonb_build_object(                                                             +
       'event_name', v_event_settings.event_name,                                    +
       'event_eid', v_event_settings.eid,                                            +
       'total_artists', v_event_stats.total_artists,                                 +
       'total_rounds', v_event_stats.total_rounds,                                   +
       'total_voters', v_event_stats.total_voters,                                   +
       'total_votes', v_event_stats.total_votes,                                     +
       'top_artists', v_top_artists,                                                 +
       'auction_stats', v_auction_stats                                              +
     )                                                                               +
   );                                                                                +
 END;                                                                                +
 $function$                                                                          +
 
(1 row)

