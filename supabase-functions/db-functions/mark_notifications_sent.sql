                                  pg_get_functiondef                                  
--------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.mark_notifications_sent(p_notification_ids uuid[])+
  RETURNS integer                                                                    +
  LANGUAGE plpgsql                                                                   +
 AS $function$                                                                       +
 DECLARE                                                                             +
   v_count INT;                                                                      +
 BEGIN                                                                               +
   UPDATE slack_notifications                                                        +
   SET                                                                               +
     status = 'sent',                                                                +
     sent_at = NOW()                                                                 +
   WHERE id = ANY(p_notification_ids)                                                +
     AND status = 'pending';                                                         +
                                                                                     +
   GET DIAGNOSTICS v_count = ROW_COUNT;                                              +
   RETURN v_count;                                                                   +
 END;                                                                                +
 $function$                                                                          +
 
(1 row)

