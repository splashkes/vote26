                                                  pg_get_functiondef                                                   
-----------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.process_slack_queue_batch(batch_size integer DEFAULT 20)                           +
  RETURNS jsonb                                                                                                       +
  LANGUAGE plpgsql                                                                                                    +
  SECURITY DEFINER                                                                                                    +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                                     +
 AS $function$                                                                                                        +
  DECLARE                                                                                                             +
      v_notification RECORD;                                                                                          +
      v_processed INTEGER := 0;                                                                                       +
      v_succeeded INTEGER := 0;                                                                                       +
      v_failed INTEGER := 0;                                                                                          +
      v_result BOOLEAN;                                                                                               +
      v_start_time TIMESTAMP := NOW();                                                                                +
      v_delay_seconds INTEGER := 0;                                                                                   +
      v_lookup_result RECORD;                                                                                         +
  BEGIN                                                                                                               +
      -- STEP 1: Process channel lookups first (convert pending_lookup to pending)                                    +
      -- Process up to half the batch_size for lookups to avoid overwhelming API                                      +
      SELECT * INTO v_lookup_result                                                                                   +
      FROM process_slack_channel_lookups(LEAST(batch_size / 2, 10)::integer);                                         +
                                                                                                                      +
      RAISE NOTICE 'Channel lookups: % processed, % resolved, % failed',                                              +
                   v_lookup_result.processed, v_lookup_result.resolved, v_lookup_result.failed;                       +
                                                                                                                      +
      -- STEP 2: Process regular pending notifications                                                                +
      FOR v_notification IN                                                                                           +
          SELECT id                                                                                                   +
          FROM slack_notifications                                                                                    +
          WHERE status = 'pending'                                                                                    +
          ORDER BY created_at ASC                                                                                     +
          LIMIT batch_size                                                                                            +
      LOOP                                                                                                            +
          -- Add small delay between messages to avoid rate limiting                                                  +
          IF v_processed > 0 AND (v_processed % 5) = 0 THEN                                                           +
              -- Add 2 second delay every 5 messages                                                                  +
              PERFORM pg_sleep(2);                                                                                    +
          END IF;                                                                                                     +
                                                                                                                      +
          SELECT process_slack_notification(v_notification.id) INTO v_result;                                         +
                                                                                                                      +
          v_processed := v_processed + 1;                                                                             +
          IF v_result THEN                                                                                            +
              v_succeeded := v_succeeded + 1;                                                                         +
          ELSE                                                                                                        +
              v_failed := v_failed + 1;                                                                               +
          END IF;                                                                                                     +
                                                                                                                      +
          -- Log progress every 10 messages                                                                           +
          IF (v_processed % 10) = 0 THEN                                                                              +
              RAISE NOTICE 'Queue processing: % processed, % succeeded, % failed', v_processed, v_succeeded, v_failed;+
          END IF;                                                                                                     +
      END LOOP;                                                                                                       +
                                                                                                                      +
      RETURN jsonb_build_object(                                                                                      +
          'processed', v_processed,                                                                                   +
          'succeeded', v_succeeded,                                                                                   +
          'failed', v_failed,                                                                                         +
          'lookup_processed', v_lookup_result.processed,                                                              +
          'lookup_resolved', v_lookup_result.resolved,                                                                +
          'lookup_failed', v_lookup_result.failed,                                                                    +
          'duration_seconds', EXTRACT(EPOCH FROM (NOW() - v_start_time))::INTEGER,                                    +
          'timestamp', NOW()                                                                                          +
      );                                                                                                              +
  END;                                                                                                                +
  $function$                                                                                                          +
 
(1 row)

