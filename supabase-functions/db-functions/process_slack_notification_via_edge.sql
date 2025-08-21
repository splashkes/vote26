                                      pg_get_functiondef                                       
-----------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.process_slack_notification_via_edge(p_notification_id uuid)+
  RETURNS boolean                                                                             +
  LANGUAGE plpgsql                                                                            +
 AS $function$                                                                                +
 DECLARE                                                                                      +
   v_notification RECORD;                                                                     +
   v_formatted_message JSONB;                                                                 +
 BEGIN                                                                                        +
   -- Get the notification                                                                    +
   SELECT * INTO v_notification                                                               +
   FROM slack_notifications                                                                   +
   WHERE id = p_notification_id;                                                              +
                                                                                              +
   IF v_notification IS NULL OR v_notification.status != 'pending' THEN                       +
     RETURN FALSE;                                                                            +
   END IF;                                                                                    +
                                                                                              +
   -- Format the message                                                                      +
   v_formatted_message := format_slack_message(                                               +
     v_notification.message_type,                                                             +
     v_notification.payload                                                                   +
   );                                                                                         +
                                                                                              +
   -- Store formatted message for Edge Function to pick up                                    +
   UPDATE slack_notifications                                                                 +
   SET                                                                                        +
     payload = payload || jsonb_build_object(                                                 +
       'formatted_blocks', v_formatted_message,                                               +
       'ready_to_send', true                                                                  +
     ),                                                                                       +
     last_attempt_at = NOW()                                                                  +
   WHERE id = p_notification_id;                                                              +
                                                                                              +
   -- Edge Function will handle the actual sending                                            +
   RETURN TRUE;                                                                               +
 END;                                                                                         +
 $function$                                                                                   +
 
(1 row)

