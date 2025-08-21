                                        pg_get_functiondef                                        
--------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.mark_notification_failed(p_notification_id uuid, p_error text)+
  RETURNS void                                                                                   +
  LANGUAGE plpgsql                                                                               +
 AS $function$                                                                                   +
 BEGIN                                                                                           +
   UPDATE slack_notifications                                                                    +
   SET                                                                                           +
     status = CASE                                                                               +
       WHEN attempts >= 3 THEN 'failed'                                                          +
       ELSE 'pending'                                                                            +
     END,                                                                                        +
     error = p_error                                                                             +
   WHERE id = p_notification_id;                                                                 +
 END;                                                                                            +
 $function$                                                                                      +
 
(1 row)

