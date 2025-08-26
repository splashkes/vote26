                                     pg_get_functiondef                                      
---------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.manual_process_slack_queue()                             +
  RETURNS jsonb                                                                             +
  LANGUAGE plpgsql                                                                          +
 AS $function$                                                                              +
 DECLARE                                                                                    +
   v_notification RECORD;                                                                   +
   v_processed INT := 0;                                                                    +
   v_formatted INT := 0;                                                                    +
 BEGIN                                                                                      +
   -- Process notifications to add formatted blocks                                         +
   FOR v_notification IN                                                                    +
     SELECT id                                                                              +
     FROM slack_notifications                                                               +
     WHERE status = 'pending'                                                               +
       AND NOT (payload ? 'formatted_blocks')                                               +
     LIMIT 20                                                                               +
   LOOP                                                                                     +
     IF process_slack_notification(v_notification.id) THEN                                  +
       v_formatted := v_formatted + 1;                                                      +
     END IF;                                                                                +
     v_processed := v_processed + 1;                                                        +
   END LOOP;                                                                                +
                                                                                            +
   -- Get batch of formatted notifications ready to send                                    +
   RETURN jsonb_build_object(                                                               +
     'processed', v_processed,                                                              +
     'formatted', v_formatted,                                                              +
     'ready_to_send', send_slack_notification_batch(),                                      +
     'timestamp', NOW()                                                                     +
   );                                                                                       +
 END;                                                                                       +
 $function$                                                                                 +
 
 CREATE OR REPLACE FUNCTION public.manual_process_slack_queue(batch_size integer DEFAULT 20)+
  RETURNS jsonb                                                                             +
  LANGUAGE plpgsql                                                                          +
 AS $function$                                                                              +
 DECLARE                                                                                    +
     v_result JSONB;                                                                        +
 BEGIN                                                                                      +
     SELECT process_slack_queue_batch(batch_size) INTO v_result;                            +
                                                                                            +
     RAISE NOTICE 'Manual queue processing completed: %', v_result;                         +
                                                                                            +
     RETURN v_result;                                                                       +
 END;                                                                                       +
 $function$                                                                                 +
 
(2 rows)

