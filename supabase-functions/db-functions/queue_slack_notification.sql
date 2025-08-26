                                                                                    pg_get_functiondef                                                                                     
-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.queue_slack_notification(p_channel_name text, p_message_type text, p_text text, p_blocks jsonb DEFAULT NULL::jsonb, p_event_id uuid DEFAULT NULL::uuid)+
  RETURNS uuid                                                                                                                                                                            +
  LANGUAGE plpgsql                                                                                                                                                                        +
  SECURITY DEFINER                                                                                                                                                                        +
 AS $function$                                                                                                                                                                            +
 DECLARE                                                                                                                                                                                  +
     v_channel_id TEXT;                                                                                                                                                                   +
     v_notification_id UUID;                                                                                                                                                              +
     v_payload JSONB;                                                                                                                                                                     +
 BEGIN                                                                                                                                                                                    +
     -- Resolve channel using real-time lookup                                                                                                                                            +
     v_channel_id := resolve_slack_channel(p_channel_name);                                                                                                                               +
                                                                                                                                                                                          +
     -- Build payload                                                                                                                                                                     +
     v_payload := jsonb_build_object(                                                                                                                                                     +
         'text', p_text,                                                                                                                                                                  +
         'channel_name', p_channel_name                                                                                                                                                   +
     );                                                                                                                                                                                   +
                                                                                                                                                                                          +
     IF p_blocks IS NOT NULL THEN                                                                                                                                                         +
         v_payload := v_payload || jsonb_build_object('blocks', p_blocks);                                                                                                                +
     END IF;                                                                                                                                                                              +
                                                                                                                                                                                          +
     -- Queue the notification                                                                                                                                                            +
     INSERT INTO slack_notifications (                                                                                                                                                    +
         event_id,                                                                                                                                                                        +
         channel_id,                                                                                                                                                                      +
         message_type,                                                                                                                                                                    +
         payload,                                                                                                                                                                         +
         status,                                                                                                                                                                          +
         created_at                                                                                                                                                                       +
     ) VALUES (                                                                                                                                                                           +
         p_event_id,                                                                                                                                                                      +
         v_channel_id,                                                                                                                                                                    +
         p_message_type,                                                                                                                                                                  +
         v_payload,                                                                                                                                                                       +
         'pending',                                                                                                                                                                       +
         NOW()                                                                                                                                                                            +
     ) RETURNING id INTO v_notification_id;                                                                                                                                               +
                                                                                                                                                                                          +
     RETURN v_notification_id;                                                                                                                                                            +
 END;                                                                                                                                                                                     +
 $function$                                                                                                                                                                               +
 
(1 row)

