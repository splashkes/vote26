                                          pg_get_functiondef                                          
------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.process_pending_slack_notifications(batch_size integer DEFAULT 10)+
  RETURNS jsonb                                                                                      +
  LANGUAGE plpgsql                                                                                   +
 AS $function$                                                                                       +
  DECLARE                                                                                            +
      v_notification RECORD;                                                                         +
      v_processed INTEGER := 0;                                                                      +
      v_succeeded INTEGER := 0;                                                                      +
      v_failed INTEGER := 0;                                                                         +
      v_result BOOLEAN;                                                                              +
  BEGIN                                                                                              +
      -- Process pending notifications in batches                                                    +
      FOR v_notification IN                                                                          +
          SELECT id                                                                                  +
          FROM slack_notifications                                                                   +
          WHERE status = 'pending'                                                                   +
          ORDER BY created_at ASC                                                                    +
          LIMIT batch_size                                                                           +
      LOOP                                                                                           +
          SELECT process_slack_notification(v_notification.id) INTO v_result;                        +
                                                                                                     +
          v_processed := v_processed + 1;                                                            +
          IF v_result THEN                                                                           +
              v_succeeded := v_succeeded + 1;                                                        +
          ELSE                                                                                       +
              v_failed := v_failed + 1;                                                              +
          END IF;                                                                                    +
      END LOOP;                                                                                      +
                                                                                                     +
      RETURN jsonb_build_object(                                                                     +
          'processed', v_processed,                                                                  +
          'succeeded', v_succeeded,                                                                  +
          'failed', v_failed,                                                                        +
          'timestamp', now()                                                                         +
      );                                                                                             +
  END;                                                                                               +
  $function$                                                                                         +
 
(1 row)

