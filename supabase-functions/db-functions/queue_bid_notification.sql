                              pg_get_functiondef                               
-------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.queue_bid_notification()                   +
  RETURNS trigger                                                             +
  LANGUAGE plpgsql                                                            +
 AS $function$                                                                +
 DECLARE                                                                      +
   v_event_settings RECORD;                                                   +
   v_channel VARCHAR;                                                         +
   v_art_info RECORD;                                                         +
   v_person_name VARCHAR;                                                     +
   v_bid_amount NUMERIC;                                                      +
   v_event_id UUID;                                                           +
 BEGIN                                                                        +
   -- First get the event_id from the art record                              +
   SELECT event_id INTO v_event_id                                            +
   FROM art                                                                   +
   WHERE id = NEW.art_id;                                                     +
                                                                              +
   -- Get event settings and info (FIXED: Get currency from countries table)  +
   SELECT                                                                     +
     es.*,                                                                    +
     e.name as event_name,                                                    +
     e.slack_channel,                                                         +
     COALESCE(co.currency_symbol, '$') as currency_symbol                     +
   INTO v_event_settings                                                      +
   FROM event_slack_settings es                                               +
   JOIN events e ON e.id = es.event_id                                        +
   LEFT JOIN cities c ON e.city_id = c.id                                     +
   LEFT JOIN countries co ON c.country_id = co.id                             +
   WHERE es.event_id = v_event_id;                                            +
                                                                              +
   -- Only proceed if bid notifications are enabled                           +
   IF NOT COALESCE(v_event_settings.bid_notifications, false) THEN            +
     RETURN NEW;                                                              +
   END IF;                                                                    +
                                                                              +
   -- Determine channel (use friendly names)                                  +
   v_channel := COALESCE(                                                     +
     CASE                                                                     +
       WHEN v_event_settings.channel_name ~ '^[CGD][0-9A-Z]+$' THEN 'general' +
       ELSE v_event_settings.channel_name                                     +
     END,                                                                     +
     CASE                                                                     +
       WHEN v_event_settings.slack_channel ~ '^[CGD][0-9A-Z]+$' THEN 'general'+
       ELSE v_event_settings.slack_channel                                    +
     END,                                                                     +
     'general'                                                                +
   );                                                                         +
                                                                              +
   -- Get art and person info                                                 +
   SELECT                                                                     +
     a.id,                                                                    +
     a.description as title,                                                  +
     ap.name as artist_name,                                                  +
     a.easel as easel_number                                                  +
   INTO v_art_info                                                            +
   FROM art a                                                                 +
   LEFT JOIN artist_profiles ap ON a.artist_id = ap.id                        +
   WHERE a.id = NEW.art_id;                                                   +
                                                                              +
   -- Get bidder name (masked)                                                +
   SELECT mask_name(COALESCE(nickname, 'Bidder')) INTO v_person_name          +
   FROM people                                                                +
   WHERE id = NEW.person_id;                                                  +
                                                                              +
   -- Use bid amount directly (already in dollars)                            +
   v_bid_amount := NEW.amount;                                                +
                                                                              +
   -- Queue the notification using cache-only approach                        +
   PERFORM queue_notification_with_cache_only(                                +
     v_event_id,                                                              +
     v_channel,                                                               +
     'bid_placed',                                                            +
     jsonb_build_object(                                                      +
       'art_id', NEW.art_id,                                                  +
       'art_title', v_art_info.title,                                         +
       'artist_name', v_art_info.artist_name,                                 +
       'easel_number', v_art_info.easel_number,                               +
       'bidder_name', v_person_name,                                          +
       'bid_amount', v_bid_amount,                                            +
       'currency_symbol', v_event_settings.currency_symbol,                   +
       'event_name', v_event_settings.event_name                              +
     )                                                                        +
   );                                                                         +
                                                                              +
   RETURN NEW;                                                                +
 END;                                                                         +
 $function$                                                                   +
 
(1 row)

