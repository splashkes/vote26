                                             pg_get_functiondef                                              
-------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.process_message_queue()                                                  +
  RETURNS TABLE(processed integer, failed integer)                                                          +
  LANGUAGE plpgsql                                                                                          +
  SECURITY DEFINER                                                                                          +
 AS $function$                                                                                              +
 DECLARE                                                                                                    +
   v_message RECORD;                                                                                        +
   v_request_id BIGINT;                                                                                     +
   v_edge_function_url TEXT;                                                                                +
   v_service_role_key TEXT;                                                                                 +
   v_processed INT := 0;                                                                                    +
   v_failed INT := 0;                                                                                       +
   v_twilio_enabled BOOLEAN;                                                                                +
 BEGIN                                                                                                      +
   -- Get configuration                                                                                     +
   SELECT value::boolean INTO v_twilio_enabled                                                              +
   FROM sms_config WHERE key = 'twilio_enabled';                                                            +
                                                                                                            +
   IF NOT v_twilio_enabled THEN                                                                             +
     RETURN QUERY SELECT 0, 0;                                                                              +
     RETURN;                                                                                                +
   END IF;                                                                                                  +
                                                                                                            +
   SELECT value INTO v_edge_function_url                                                                    +
   FROM sms_config WHERE key = 'edge_function_url';                                                         +
                                                                                                            +
   SELECT value INTO v_service_role_key                                                                     +
   FROM sms_config WHERE key = 'service_role_key';                                                          +
                                                                                                            +
   -- Process pending messages                                                                              +
   FOR v_message IN                                                                                         +
     SELECT * FROM message_queue                                                                            +
     WHERE status = 'pending'                                                                               +
       AND send_after <= NOW()                                                                              +
       AND retry_count < 3                                                                                  +
       AND (send_immediately = false OR processing_started_at IS NULL)                                      +
     ORDER BY priority ASC, created_at ASC                                                                  +
     LIMIT 10                                                                                               +
   LOOP                                                                                                     +
     -- IMMEDIATELY mark as processing to prevent race condition                                            +
     UPDATE message_queue                                                                                   +
     SET                                                                                                    +
       processing_started_at = NOW(),                                                                       +
       last_attempt_at = NOW()                                                                              +
     WHERE id = v_message.id                                                                                +
       AND processing_started_at IS NULL; -- Double-check it wasn't already claimed                         +
                                                                                                            +
     -- Only proceed if we successfully claimed the message                                                 +
     IF FOUND THEN                                                                                          +
       -- Send via pg_net                                                                                   +
       SELECT net.http_post(                                                                                +
         url := v_edge_function_url,                                                                        +
         headers := jsonb_build_object(                                                                     +
           'Authorization', 'Bearer ' || v_service_role_key,                                                +
           'Content-Type', 'application/json'                                                               +
         ),                                                                                                 +
         body := jsonb_build_object(                                                                        +
           'to', v_message.destination,                                                                     +
           'from', v_message.from_phone,                                                                    +
           'body', v_message.message_body,                                                                  +
           'messageId', v_message.id                                                                        +
         )                                                                                                  +
       ) INTO v_request_id;                                                                                 +
                                                                                                            +
       -- Update message status with request ID                                                             +
       UPDATE message_queue                                                                                 +
       SET                                                                                                  +
         status = 'processing',                                                                             +
         metadata = COALESCE(metadata, '{}')::jsonb || jsonb_build_object('pg_net_request_id', v_request_id)+
       WHERE id = v_message.id;                                                                             +
                                                                                                            +
       v_processed := v_processed + 1;                                                                      +
     END IF;                                                                                                +
   END LOOP;                                                                                                +
                                                                                                            +
   -- Check results from previous requests                                                                  +
   PERFORM check_sms_results();                                                                             +
                                                                                                            +
   RETURN QUERY SELECT v_processed, v_failed;                                                               +
 END;                                                                                                       +
 $function$                                                                                                 +
 
(1 row)

