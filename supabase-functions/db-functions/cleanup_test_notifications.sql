                                           pg_get_functiondef                                           
--------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.cleanup_test_notifications()                                        +
  RETURNS integer                                                                                      +
  LANGUAGE plpgsql                                                                                     +
  SECURITY DEFINER                                                                                     +
 AS $function$                                                                                         +
 DECLARE                                                                                               +
   v_cleaned INTEGER;                                                                                  +
 BEGIN                                                                                                 +
   -- Mark test messages as sent to prevent spam                                                       +
   WITH cleaned AS (                                                                                   +
     UPDATE slack_notifications                                                                        +
     SET status = 'sent',                                                                              +
         sent_at = NOW(),                                                                              +
         error = 'Auto-cleaned: test message'                                                          +
     WHERE (message_type LIKE '%test%'                                                                 +
            OR payload->>'test_run' = 'true'                                                           +
            OR payload->>'test' IS NOT NULL                                                            +
            OR (payload->>'text' IS NULL AND message_type IN ('bulk_profile_test', 'performance_test'))+
           )                                                                                           +
       AND status IN ('pending', 'pending_lookup', 'failed')                                           +
     RETURNING id                                                                                      +
   )                                                                                                   +
   SELECT COUNT(*) INTO v_cleaned FROM cleaned;                                                        +
                                                                                                       +
   RETURN v_cleaned;                                                                                   +
 END;                                                                                                  +
 $function$                                                                                            +
 
(1 row)

