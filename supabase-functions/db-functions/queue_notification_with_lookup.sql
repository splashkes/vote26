                                                                           pg_get_functiondef                                                                           
------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.queue_notification_with_lookup(p_event_id uuid, p_channel_name character varying, p_message_type character varying, p_payload jsonb)+
  RETURNS uuid                                                                                                                                                         +
  LANGUAGE plpgsql                                                                                                                                                     +
 AS $function$                                                                                                                                                         +
 DECLARE                                                                                                                                                               +
   v_channel_id VARCHAR;                                                                                                                                               +
   v_notification_id UUID;                                                                                                                                             +
   v_clean_channel VARCHAR;                                                                                                                                            +
 BEGIN                                                                                                                                                                 +
   -- Clean channel name                                                                                                                                               +
   v_clean_channel := LTRIM(p_channel_name, '#');                                                                                                                      +
                                                                                                                                                                       +
   -- Try to resolve channel ID from cache                                                                                                                             +
   v_channel_id := resolve_slack_channel(p_channel_name);                                                                                                              +
                                                                                                                                                                       +
   -- If not found in cache, queue for lookup                                                                                                                          +
   IF v_channel_id IS NULL THEN                                                                                                                                        +
     -- Insert notification with channel name for later resolution                                                                                                     +
     INSERT INTO slack_notifications (                                                                                                                                 +
       event_id,                                                                                                                                                       +
       channel_id,                                                                                                                                                     +
       message_type,                                                                                                                                                   +
       payload,                                                                                                                                                        +
       status                                                                                                                                                          +
     ) VALUES (                                                                                                                                                        +
       p_event_id,                                                                                                                                                     +
       NULL, -- No ID yet                                                                                                                                              +
       p_message_type,                                                                                                                                                 +
       p_payload || jsonb_build_object(                                                                                                                                +
         'channel_name', v_clean_channel,                                                                                                                              +
         'needs_channel_lookup', true                                                                                                                                  +
       ),                                                                                                                                                              +
       'pending_lookup' -- New status for notifications needing channel lookup                                                                                         +
     ) RETURNING id INTO v_notification_id;                                                                                                                            +
   ELSE                                                                                                                                                                +
     -- Insert notification with resolved channel ID                                                                                                                   +
     INSERT INTO slack_notifications (                                                                                                                                 +
       event_id,                                                                                                                                                       +
       channel_id,                                                                                                                                                     +
       message_type,                                                                                                                                                   +
       payload                                                                                                                                                         +
     ) VALUES (                                                                                                                                                        +
       p_event_id,                                                                                                                                                     +
       v_channel_id,                                                                                                                                                   +
       p_message_type,                                                                                                                                                 +
       p_payload                                                                                                                                                       +
     ) RETURNING id INTO v_notification_id;                                                                                                                            +
   END IF;                                                                                                                                                             +
                                                                                                                                                                       +
   RETURN v_notification_id;                                                                                                                                           +
 END;                                                                                                                                                                  +
 $function$                                                                                                                                                            +
 
(1 row)

