                                               pg_get_functiondef                                               
----------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.queue_bid_notification()                                                    +
  RETURNS trigger                                                                                              +
  LANGUAGE plpgsql                                                                                             +
 AS $function$                                                                                                 +
 DECLARE                                                                                                       +
   v_event_settings RECORD;                                                                                    +
   v_threshold NUMERIC;                                                                                        +
   v_artist_name VARCHAR;                                                                                      +
   v_art_code VARCHAR;                                                                                         +
   v_event_id UUID;                                                                                            +
   v_channel_id VARCHAR;                                                                                       +
 BEGIN                                                                                                         +
   -- Get event ID from art table                                                                              +
   SELECT event_id, art_code INTO v_event_id, v_art_code                                                       +
   FROM art                                                                                                    +
   WHERE id = NEW.art_id;                                                                                      +
                                                                                                               +
   -- Get event settings                                                                                       +
   SELECT * INTO v_event_settings                                                                              +
   FROM event_slack_settings                                                                                   +
   WHERE event_id = v_event_id;                                                                                +
                                                                                                               +
   -- Resolve channel name to ID                                                                               +
   v_channel_id := resolve_slack_channel(COALESCE(v_event_settings.channel_name, v_event_settings.channel_id));+
                                                                                                               +
   -- Check if we should send notification                                                                     +
   IF v_event_settings.bid_notifications AND v_channel_id IS NOT NULL THEN                                     +
     -- Get threshold                                                                                          +
     v_threshold := COALESCE(                                                                                  +
       (v_event_settings.threshold_settings->>'min_bid_amount')::NUMERIC,                                      +
       100                                                                                                     +
     );                                                                                                        +
                                                                                                               +
     -- Only notify for bids above threshold                                                                   +
     IF NEW.amount >= v_threshold THEN                                                                         +
       -- Get artist info                                                                                      +
       SELECT ap.name INTO v_artist_name                                                                       +
       FROM art a                                                                                              +
       JOIN artist_profiles ap ON a.artist_id = ap.id                                                          +
       WHERE a.id = NEW.art_id;                                                                                +
                                                                                                               +
       -- Queue notification                                                                                   +
       INSERT INTO slack_notifications (                                                                       +
         event_id,                                                                                             +
         channel_id,                                                                                           +
         message_type,                                                                                         +
         payload                                                                                               +
       ) VALUES (                                                                                              +
         v_event_id,                                                                                           +
         v_channel_id,                                                                                         +
         'new_bid',                                                                                            +
         jsonb_build_object(                                                                                   +
           'art_id', NEW.art_id,                                                                               +
           'art_code', v_art_code,                                                                             +
           'artist_name', v_artist_name,                                                                       +
           'bid_amount', NEW.amount,                                                                           +
           'bidder_id', NEW.person_id,                                                                         +
           'is_high_value', NEW.amount > 1000                                                                  +
         )                                                                                                     +
       );                                                                                                      +
     END IF;                                                                                                   +
   END IF;                                                                                                     +
                                                                                                               +
   RETURN NEW;                                                                                                 +
 END;                                                                                                          +
 $function$                                                                                                    +
 
(1 row)

