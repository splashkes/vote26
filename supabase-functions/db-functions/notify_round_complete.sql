                                            pg_get_functiondef                                             
-----------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.notify_round_complete()                                                +
  RETURNS trigger                                                                                         +
  LANGUAGE plpgsql                                                                                        +
 AS $function$                                                                                            +
 DECLARE                                                                                                  +
   v_event_settings RECORD;                                                                               +
   v_winner RECORD;                                                                                       +
 BEGIN                                                                                                    +
   -- Only trigger when round is marked as finished                                                       +
   IF NEW.is_finished = true AND OLD.is_finished = false THEN                                             +
     -- Get event settings                                                                                +
     SELECT * INTO v_event_settings                                                                       +
     FROM event_slack_settings                                                                            +
     WHERE event_id = NEW.event_id;                                                                       +
                                                                                                          +
     IF v_event_settings.round_notifications AND v_event_settings.channel_id IS NOT NULL THEN             +
       -- Get round winner                                                                                +
       SELECT ap.name as artist_name, COUNT(v.id) as vote_count                                           +
       INTO v_winner                                                                                      +
       FROM round_contestants rc                                                                          +
       JOIN artist_profiles ap ON rc.artist_id = ap.id                                                    +
       LEFT JOIN art a ON a.artist_id = ap.id AND a.event_id = NEW.event_id AND a.round = NEW.round_number+
       LEFT JOIN votes v ON v.art_id = a.id                                                               +
       WHERE rc.round_id = NEW.id AND rc.is_winner = 1                                                    +
       GROUP BY ap.name                                                                                   +
       LIMIT 1;                                                                                           +
                                                                                                          +
       IF v_winner.artist_name IS NOT NULL THEN                                                           +
         INSERT INTO slack_notifications (                                                                +
           event_id,                                                                                      +
           channel_id,                                                                                    +
           message_type,                                                                                  +
           payload                                                                                        +
         ) VALUES (                                                                                       +
           NEW.event_id,                                                                                  +
           v_event_settings.channel_id,                                                                   +
           'round_complete',                                                                              +
           jsonb_build_object(                                                                            +
             'round_number', NEW.round_number,                                                            +
             'winner_name', v_winner.artist_name,                                                         +
             'winner_votes', v_winner.vote_count                                                          +
           )                                                                                              +
         );                                                                                               +
       END IF;                                                                                            +
     END IF;                                                                                              +
   END IF;                                                                                                +
                                                                                                          +
   RETURN NEW;                                                                                            +
 END;                                                                                                     +
 $function$                                                                                               +
 
(1 row)

