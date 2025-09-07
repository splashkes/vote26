                           pg_get_functiondef                           
------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.test_slack_performance()            +
  RETURNS TABLE(test_name text, execution_time_ms numeric, result text)+
  LANGUAGE plpgsql                                                     +
 AS $function$                                                         +
 DECLARE                                                               +
   v_start_time TIMESTAMPTZ;                                           +
   v_end_time TIMESTAMPTZ;                                             +
   v_result VARCHAR;                                                   +
   v_test_event_id UUID;                                               +
 BEGIN                                                                 +
   -- Get a real event ID for testing                                  +
   SELECT id INTO v_test_event_id FROM events LIMIT 1;                 +
                                                                       +
   IF v_test_event_id IS NULL THEN                                     +
     RETURN QUERY SELECT                                               +
       'No events found - skipping queue tests'::TEXT,                 +
       0::NUMERIC,                                                     +
       'Cannot test without event'::TEXT;                              +
   ELSE                                                                +
     -- Test 1: Cache-only lookup (should be fast)                     +
     v_start_time := clock_timestamp();                                +
                                                                       +
     SELECT queue_notification_with_cache_only(                        +
       v_test_event_id,                                                +
       'general',                                                      +
       'performance_test',                                             +
       jsonb_build_object('test', 'cache_lookup', 'timestamp', NOW())  +
     )::TEXT INTO v_result;                                            +
                                                                       +
     v_end_time := clock_timestamp();                                  +
                                                                       +
     RETURN QUERY SELECT                                               +
       'Cache-only notification queue'::TEXT,                          +
       EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time))::NUMERIC,+
       'Notification ID: ' || v_result;                                +
   END IF;                                                             +
                                                                       +
   -- Test 2: Direct cache lookup                                      +
   v_start_time := clock_timestamp();                                  +
                                                                       +
   PERFORM get_cached_slack_channel('general');                        +
   PERFORM get_cached_slack_channel('nonexistent-channel');            +
                                                                       +
   v_end_time := clock_timestamp();                                    +
                                                                       +
   RETURN QUERY SELECT                                                 +
     'Direct cache lookups (2 calls)'::TEXT,                           +
     EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time))::NUMERIC,  +
     'Cache hits and misses'::TEXT;                                    +
                                                                       +
   -- Test 3: Multiple queue operations (only if we have an event)     +
   IF v_test_event_id IS NOT NULL THEN                                 +
     v_start_time := clock_timestamp();                                +
                                                                       +
     FOR i IN 1..10 LOOP                                               +
       PERFORM queue_notification_with_cache_only(                     +
         v_test_event_id,                                              +
         'general',                                                    +
         'performance_test_batch',                                     +
         jsonb_build_object('test', 'batch_' || i, 'timestamp', NOW()) +
       );                                                              +
     END LOOP;                                                         +
                                                                       +
     v_end_time := clock_timestamp();                                  +
                                                                       +
     RETURN QUERY SELECT                                               +
       'Batch queue operations (10 calls)'::TEXT,                      +
       EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time))::NUMERIC,+
       'All operations completed'::TEXT;                               +
   END IF;                                                             +
 END;                                                                  +
 $function$                                                            +
 
(1 row)

