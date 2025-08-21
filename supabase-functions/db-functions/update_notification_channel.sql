                                                  pg_get_functiondef                                                   
-----------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.update_notification_channel(p_notification_id uuid, p_channel_id character varying)+
  RETURNS void                                                                                                        +
  LANGUAGE plpgsql                                                                                                    +
 AS $function$                                                                                                        +
 BEGIN                                                                                                                +
   UPDATE slack_notifications                                                                                         +
   SET                                                                                                                +
     channel_id = p_channel_id,                                                                                       +
     status = 'pending',                                                                                              +
     payload = payload - 'needs_channel_lookup' - 'channel_name'                                                      +
   WHERE id = p_notification_id;                                                                                      +
 END;                                                                                                                 +
 $function$                                                                                                           +
 
(1 row)

