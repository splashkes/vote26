                                  pg_get_functiondef                                  
--------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.cleanup_slack_test_data()                         +
  RETURNS jsonb                                                                      +
  LANGUAGE plpgsql                                                                   +
 AS $function$                                                                       +
 DECLARE                                                                             +
   v_event_id UUID;                                                                  +
   v_deleted RECORD;                                                                 +
 BEGIN                                                                               +
   -- Get test event ID                                                              +
   SELECT id INTO v_event_id FROM events WHERE eid = 'TEST123';                      +
                                                                                     +
   IF v_event_id IS NULL THEN                                                        +
     RETURN jsonb_build_object('message', 'No test data found');                     +
   END IF;                                                                           +
                                                                                     +
   -- Delete test data                                                               +
   DELETE FROM slack_notifications WHERE event_id = v_event_id;                      +
   DELETE FROM votes WHERE event_id = v_event_id;                                    +
   DELETE FROM bids WHERE art_id IN (SELECT id FROM art WHERE event_id = v_event_id);+
   DELETE FROM art WHERE event_id = v_event_id;                                      +
   DELETE FROM event_slack_settings WHERE event_id = v_event_id;                     +
                                                                                     +
   RETURN jsonb_build_object(                                                        +
     'message', 'Test data cleaned up',                                              +
     'event_id', v_event_id                                                          +
   );                                                                                +
 END;                                                                                +
 $function$                                                                          +
 
(1 row)

