                                                                            pg_get_functiondef                                                                             
---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.send_sms_instantly(p_destination text, p_message_body text, p_metadata jsonb DEFAULT '{}'::jsonb)                                      +
  RETURNS uuid                                                                                                                                                            +
  LANGUAGE plpgsql                                                                                                                                                        +
  SECURITY DEFINER                                                                                                                                                        +
  SET search_path TO 'public'                                                                                                                                             +
 AS $function$                                                                                                                                                            +
  DECLARE                                                                                                                                                                 +
    v_message_id UUID;                                                                                                                                                    +
    v_from_phone TEXT;                                                                                                                                                    +
    v_event_code TEXT;                                                                                                                                                    +
    v_event_id UUID;                                                                                                                                                      +
    v_hardcoded_fallback TEXT := '+18887111857';                                                                                                                          +
  BEGIN                                                                                                                                                                   +
    -- Generate message ID                                                                                                                                                +
    v_message_id := gen_random_uuid();                                                                                                                                    +
                                                                                                                                                                          +
    -- Try to get event code from art_id in metadata                                                                                                                      +
    v_event_code := split_part(p_metadata->>'art_id', '-', 1);                                                                                                            +
                                                                                                                                                                          +
    -- Look up actual event UUID from event code (stored in eid field)                                                                                                    +
    IF v_event_code IS NOT NULL AND v_event_code != '' THEN                                                                                                               +
      SELECT id, phone_number INTO v_event_id, v_from_phone                                                                                                               +
      FROM events                                                                                                                                                         +
      WHERE eid = v_event_code;                                                                                                                                           +
    END IF;                                                                                                                                                               +
                                                                                                                                                                          +
    -- Fallback to hardcoded if no event phone or if event phone is same as destination                                                                                   +
    IF v_from_phone IS NULL OR v_from_phone = '' OR v_from_phone = p_destination THEN                                                                                     +
      v_from_phone := v_hardcoded_fallback;                                                                                                                               +
    END IF;                                                                                                                                                               +
                                                                                                                                                                          +
    -- Insert into message queue for immediate sending                                                                                                                    +
    INSERT INTO message_queue (                                                                                                                                           +
      id,                                                                                                                                                                 +
      channel,                                                                                                                                                            +
      destination,                                                                                                                                                        +
      message_body,                                                                                                                                                       +
      metadata,                                                                                                                                                           +
      send_immediately,                                                                                                                                                   +
      from_phone,                                                                                                                                                         +
      priority                                                                                                                                                            +
    ) VALUES (                                                                                                                                                            +
      v_message_id,                                                                                                                                                       +
      'sms',                                                                                                                                                              +
      p_destination,                                                                                                                                                      +
      p_message_body,                                                                                                                                                     +
      p_metadata || jsonb_build_object('event_id', v_event_id),                                                                                                           +
      true,                                                                                                                                                               +
      v_from_phone,                                                                                                                                                       +
      1                                                                                                                                                                   +
    );                                                                                                                                                                    +
                                                                                                                                                                          +
    RETURN v_message_id;                                                                                                                                                  +
  END;                                                                                                                                                                    +
  $function$                                                                                                                                                              +
 
 CREATE OR REPLACE FUNCTION public.send_sms_instantly(p_destination text, p_message_body text, p_metadata jsonb DEFAULT '{}'::jsonb, p_from_phone text DEFAULT NULL::text)+
  RETURNS uuid                                                                                                                                                            +
  LANGUAGE plpgsql                                                                                                                                                        +
  SECURITY DEFINER                                                                                                                                                        +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions', 'realtime'                                                                                             +
 AS $function$                                                                                                                                                            +
 DECLARE                                                                                                                                                                  +
   v_message_id UUID;                                                                                                                                                     +
   v_edge_function_url TEXT;                                                                                                                                              +
   v_service_role_key TEXT;                                                                                                                                               +
   v_request_id BIGINT;                                                                                                                                                   +
 BEGIN                                                                                                                                                                    +
   -- Get configuration                                                                                                                                                   +
   SELECT value INTO v_edge_function_url                                                                                                                                  +
   FROM sms_config WHERE key = 'edge_function_url';                                                                                                                       +
                                                                                                                                                                          +
   SELECT value INTO v_service_role_key                                                                                                                                   +
   FROM sms_config WHERE key = 'service_role_key';                                                                                                                        +
                                                                                                                                                                          +
   -- Generate message ID                                                                                                                                                 +
   v_message_id := gen_random_uuid();                                                                                                                                     +
                                                                                                                                                                          +
   -- Send via secure HTTP wrapper (SSRF protected)                                                                                                                       +
   SELECT secure_http_post(                                                                                                                                               +
     p_url := v_edge_function_url,                                                                                                                                        +
     p_body := jsonb_build_object(                                                                                                                                        +
       'to', p_destination,                                                                                                                                               +
       'from', COALESCE(p_from_phone, '+18887111857'),                                                                                                                    +
       'body', p_message_body,                                                                                                                                            +
       'messageId', v_message_id                                                                                                                                          +
     ),                                                                                                                                                                   +
     p_headers := jsonb_build_object(                                                                                                                                     +
       'Authorization', 'Bearer ' || v_service_role_key,                                                                                                                  +
       'Content-Type', 'application/json'                                                                                                                                 +
     )                                                                                                                                                                    +
   ) INTO v_request_id;                                                                                                                                                   +
                                                                                                                                                                          +
   -- Insert into message queue for tracking                                                                                                                              +
   INSERT INTO message_queue (                                                                                                                                            +
     id,                                                                                                                                                                  +
     channel,                                                                                                                                                             +
     destination,                                                                                                                                                         +
     message_body,                                                                                                                                                        +
     metadata,                                                                                                                                                            +
     status,                                                                                                                                                              +
     priority,                                                                                                                                                            +
     send_after,                                                                                                                                                          +
     from_phone                                                                                                                                                           +
   ) VALUES (                                                                                                                                                             +
     v_message_id,                                                                                                                                                        +
     'sms',                                                                                                                                                               +
     p_destination,                                                                                                                                                       +
     p_message_body,                                                                                                                                                      +
     p_metadata || jsonb_build_object('pg_net_request_id', v_request_id),                                                                                                 +
     'processing',                                                                                                                                                        +
     1, -- high priority for instant messages                                                                                                                             +
     NOW(),                                                                                                                                                               +
     COALESCE(p_from_phone, '+18887111857')                                                                                                                               +
   );                                                                                                                                                                     +
                                                                                                                                                                          +
   RETURN v_message_id;                                                                                                                                                   +
 END;                                                                                                                                                                     +
 $function$                                                                                                                                                               +
 
(2 rows)

