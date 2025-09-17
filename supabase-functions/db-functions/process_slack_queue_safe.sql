                                     pg_get_functiondef                                     
--------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.process_slack_queue_safe(p_batch_size integer DEFAULT 5)+
  RETURNS TABLE(processed integer, succeeded integer, failed integer, cleaned integer)     +
  LANGUAGE plpgsql                                                                         +
  SECURITY DEFINER                                                                         +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions', 'realtime'              +
 AS $function$                                                                             +
 DECLARE                                                                                   +
   v_notification_id UUID;                                                                 +
   v_processed INT := 0;                                                                   +
   v_succeeded INT := 0;                                                                   +
   v_failed INT := 0;                                                                      +
   v_cleaned INT := 0;                                                                     +
   v_result BOOLEAN;                                                                       +
 BEGIN                                                                                     +
   -- Removed cleanup_test_notifications() call since function doesn't exist               +
   -- and we don't have test notifications to clean up                                     +
                                                                                           +
   -- Check for spam conditions                                                            +
   IF EXISTS (                                                                             +
     SELECT 1 FROM slack_notifications                                                     +
     WHERE status = 'pending'                                                              +
       AND created_at >= NOW() - INTERVAL '5 minutes'                                      +
     HAVING COUNT(*) > 50                                                                  +
   ) THEN                                                                                  +
     -- Too many pending - don't process to avoid spam                                     +
     RETURN QUERY SELECT 0, 0, 0, v_cleaned;                                               +
     RETURN;                                                                               +
   END IF;                                                                                 +
                                                                                           +
   -- Process only real notifications                                                      +
   FOR v_notification_id IN                                                                +
     SELECT id                                                                             +
     FROM slack_notifications                                                              +
     WHERE status = 'pending'                                                              +
       AND attempts < 3                                                                    +
       AND message_type NOT LIKE '%test%'                                                  +
       AND payload->>'test_run' IS DISTINCT FROM 'true'                                    +
       AND payload->>'text' IS NOT NULL                                                    +
       AND TRIM(payload->>'text') != ''                                                    +
     ORDER BY created_at                                                                   +
     LIMIT p_batch_size                                                                    +
   LOOP                                                                                    +
     v_processed := v_processed + 1;                                                       +
     v_result := process_slack_notification(v_notification_id);                            +
                                                                                           +
     IF v_result THEN                                                                      +
       v_succeeded := v_succeeded + 1;                                                     +
     ELSE                                                                                  +
       v_failed := v_failed + 1;                                                           +
     END IF;                                                                               +
   END LOOP;                                                                               +
                                                                                           +
   RETURN QUERY SELECT v_processed, v_succeeded, v_failed, v_cleaned;                      +
 END;                                                                                      +
 $function$                                                                                +
 
(1 row)

