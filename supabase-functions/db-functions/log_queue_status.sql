                                     pg_get_functiondef                                     
--------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.log_queue_status()                                      +
  RETURNS void                                                                             +
  LANGUAGE plpgsql                                                                         +
 AS $function$                                                                             +
 DECLARE                                                                                   +
     v_status JSONB;                                                                       +
 BEGIN                                                                                     +
     SELECT get_detailed_slack_queue_status() INTO v_status;                               +
                                                                                           +
     -- Log if there are many pending notifications (> 50)                                 +
     IF (v_status->>'pending')::integer > 50 THEN                                          +
         RAISE NOTICE 'Slack Queue Alert: % pending notifications, % failed in last hour', +
             v_status->>'pending',                                                         +
             v_status->>'last_hour_failed';                                                +
     END IF;                                                                               +
 END;                                                                                      +
 $function$                                                                                +
 
(1 row)

