                                   pg_get_functiondef                                   
----------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.process_slack_queue(p_batch_size integer DEFAULT 10)+
  RETURNS TABLE(processed integer, succeeded integer, failed integer)                  +
  LANGUAGE plpgsql                                                                     +
 AS $function$                                                                         +
 DECLARE                                                                               +
   v_notification_id UUID;                                                             +
   v_processed INT := 0;                                                               +
   v_succeeded INT := 0;                                                               +
   v_failed INT := 0;                                                                  +
   v_result BOOLEAN;                                                                   +
 BEGIN                                                                                 +
   -- Process all pending notifications (no more lookup stage)                         +
   FOR v_notification_id IN                                                            +
     SELECT id                                                                         +
     FROM slack_notifications                                                          +
     WHERE status IN ('pending', 'pending_lookup')                                     +
       AND attempts < 3                                                                +
     ORDER BY created_at                                                               +
     LIMIT p_batch_size                                                                +
   LOOP                                                                                +
     v_processed := v_processed + 1;                                                   +
     v_result := process_slack_notification(v_notification_id);                        +
                                                                                       +
     IF v_result THEN                                                                  +
       v_succeeded := v_succeeded + 1;                                                 +
     ELSE                                                                              +
       v_failed := v_failed + 1;                                                       +
     END IF;                                                                           +
   END LOOP;                                                                           +
                                                                                       +
   RETURN QUERY SELECT v_processed, v_succeeded, v_failed;                             +
 END;                                                                                  +
 $function$                                                                            +
 
(1 row)

