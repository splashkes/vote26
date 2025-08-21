                                        pg_get_functiondef                                         
---------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.check_auction_closing()                                        +
  RETURNS void                                                                                    +
  LANGUAGE plpgsql                                                                                +
 AS $function$                                                                                    +
 DECLARE                                                                                          +
   v_event RECORD;                                                                                +
   v_channel_id VARCHAR;                                                                          +
   v_active_count INT;                                                                            +
 BEGIN                                                                                            +
   FOR v_event IN                                                                                 +
     SELECT e.*, es.channel_id as es_channel_id, es.channel_name                                  +
     FROM events e                                                                                +
     JOIN event_slack_settings es ON es.event_id = e.id                                           +
     WHERE e.enabled = true                                                                       +
       AND e.enable_auction = true                                                                +
       AND e.auction_close_starts_at BETWEEN NOW() AND NOW() + INTERVAL '5 minutes'               +
       AND NOT EXISTS (                                                                           +
         SELECT 1 FROM slack_notifications                                                        +
         WHERE event_id = e.id                                                                    +
         AND message_type = 'auction_closing_soon'                                                +
         AND created_at > NOW() - INTERVAL '10 minutes'                                           +
       )                                                                                          +
   LOOP                                                                                           +
     -- Resolve channel                                                                           +
     v_channel_id := resolve_slack_channel(COALESCE(v_event.channel_name, v_event.es_channel_id));+
                                                                                                  +
     IF v_channel_id IS NOT NULL THEN                                                             +
       -- Count active artworks with bids                                                         +
       SELECT COUNT(DISTINCT a.id) INTO v_active_count                                            +
       FROM art a                                                                                 +
       WHERE a.event_id = v_event.id                                                              +
         AND EXISTS (SELECT 1 FROM bids WHERE art_id = a.id);                                     +
                                                                                                  +
       INSERT INTO slack_notifications (                                                          +
         event_id,                                                                                +
         channel_id,                                                                              +
         message_type,                                                                            +
         payload                                                                                  +
       ) VALUES (                                                                                 +
         v_event.id,                                                                              +
         v_channel_id,                                                                            +
         'auction_closing_soon',                                                                  +
         jsonb_build_object(                                                                      +
           'event_name', v_event.name,                                                            +
           'minutes_left', 5,                                                                     +
           'active_artworks', v_active_count                                                      +
         )                                                                                        +
       );                                                                                         +
     END IF;                                                                                      +
   END LOOP;                                                                                      +
 END;                                                                                             +
 $function$                                                                                       +
 
(1 row)

