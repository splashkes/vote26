                                  pg_get_functiondef                                   
---------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.test_slack_integration_flow()                      +
  RETURNS jsonb                                                                       +
  LANGUAGE plpgsql                                                                    +
 AS $function$                                                                        +
 DECLARE                                                                              +
   v_result JSONB;                                                                    +
   v_test_results JSONB := '[]'::jsonb;                                               +
 BEGIN                                                                                +
   -- Test 1: Send test notification                                                  +
   v_result := send_test_slack_notification('test', '🧪 Testing Slack integration...');+
   v_test_results := v_test_results || jsonb_build_object(                            +
     'test', 'Basic notification',                                                    +
     'result', v_result                                                               +
   );                                                                                 +
                                                                                      +
   -- Test 2: Simulate voting                                                         +
   v_result := simulate_voting_activity(5);                                           +
   v_test_results := v_test_results || jsonb_build_object(                            +
     'test', 'Voting simulation',                                                     +
     'result', v_result                                                               +
   );                                                                                 +
                                                                                      +
   -- Test 3: Simulate bidding                                                        +
   v_result := simulate_bidding_activity(3, 150);                                     +
   v_test_results := v_test_results || jsonb_build_object(                            +
     'test', 'Bidding simulation',                                                    +
     'result', v_result                                                               +
   );                                                                                 +
                                                                                      +
   -- Test 4: Generate hourly summary                                                 +
   SELECT id INTO v_result FROM events WHERE eid = 'TEST123';                         +
   PERFORM generate_hourly_summary(v_result);                                         +
   v_test_results := v_test_results || jsonb_build_object(                            +
     'test', 'Hourly summary',                                                        +
     'result', jsonb_build_object('summary_queued', true)                             +
   );                                                                                 +
                                                                                      +
   -- Test 5: Process queue                                                           +
   v_result := manual_process_slack_queue();                                          +
   v_test_results := v_test_results || jsonb_build_object(                            +
     'test', 'Queue processing',                                                      +
     'result', v_result                                                               +
   );                                                                                 +
                                                                                      +
   -- Test 6: Check queue status                                                      +
   v_result := get_slack_queue_status();                                              +
   v_test_results := v_test_results || jsonb_build_object(                            +
     'test', 'Queue status',                                                          +
     'result', v_result                                                               +
   );                                                                                 +
                                                                                      +
   RETURN jsonb_build_object(                                                         +
     'test_run_complete', true,                                                       +
     'timestamp', NOW(),                                                              +
     'tests', v_test_results                                                          +
   );                                                                                 +
 END;                                                                                 +
 $function$                                                                           +
 
(1 row)

