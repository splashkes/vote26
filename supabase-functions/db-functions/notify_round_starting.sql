                                                pg_get_functiondef                                                
------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.notify_round_starting()                                                       +
  RETURNS trigger                                                                                                +
  LANGUAGE plpgsql                                                                                               +
 AS $function$                                                                                                   +
 DECLARE                                                                                                         +
   v_event_settings RECORD;                                                                                      +
   v_artist_list TEXT;                                                                                           +
   v_channel_id VARCHAR;                                                                                         +
 BEGIN                                                                                                           +
   -- Only trigger when round number changes                                                                     +
   IF NEW.current_round != OLD.current_round THEN                                                                +
     -- Get event settings                                                                                       +
     SELECT * INTO v_event_settings                                                                              +
     FROM event_slack_settings                                                                                   +
     WHERE event_id = NEW.id;                                                                                    +
                                                                                                                 +
     -- Resolve channel                                                                                          +
     v_channel_id := resolve_slack_channel(COALESCE(v_event_settings.channel_name, v_event_settings.channel_id));+
                                                                                                                 +
     IF v_event_settings.round_notifications AND v_channel_id IS NOT NULL THEN                                   +
       -- Get artists for this round                                                                             +
       SELECT string_agg(ap.name, E'\n', ap.name) INTO v_artist_list                                             +
       FROM art a                                                                                                +
       JOIN artist_profiles ap ON a.artist_id = ap.id                                                            +
       WHERE a.event_id = NEW.id                                                                                 +
         AND a.round = NEW.current_round                                                                         +
       ORDER BY a.easel;                                                                                         +
                                                                                                                 +
       INSERT INTO slack_notifications (                                                                         +
         event_id,                                                                                               +
         channel_id,                                                                                             +
         message_type,                                                                                           +
         payload                                                                                                 +
       ) VALUES (                                                                                                +
         NEW.id,                                                                                                 +
         v_channel_id,                                                                                           +
         'round_starting',                                                                                       +
         jsonb_build_object(                                                                                     +
           'round_number', NEW.current_round,                                                                    +
           'artist_list', COALESCE(v_artist_list, 'Artists being assigned...')                                   +
         )                                                                                                       +
       );                                                                                                        +
     END IF;                                                                                                     +
   END IF;                                                                                                       +
                                                                                                                 +
   RETURN NEW;                                                                                                   +
 END;                                                                                                            +
 $function$                                                                                                      +
 
(1 row)

