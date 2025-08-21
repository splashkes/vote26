                                                        pg_get_functiondef                                                        
----------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.test_sms_send(p_phone_number text, p_message text DEFAULT 'Test message from ArtBattle'::text)+
  RETURNS uuid                                                                                                                   +
  LANGUAGE plpgsql                                                                                                               +
 AS $function$                                                                                                                   +
 DECLARE                                                                                                                         +
   v_message_id uuid;                                                                                                            +
 BEGIN                                                                                                                           +
   -- Insert test message                                                                                                        +
   INSERT INTO message_queue (                                                                                                   +
     id, channel, destination, message_body,                                                                                     +
     metadata, status, priority, send_after, created_at                                                                          +
   ) VALUES (                                                                                                                    +
     gen_random_uuid(),                                                                                                          +
     'sms',                                                                                                                      +
     p_phone_number,                                                                                                             +
     p_message,                                                                                                                  +
     jsonb_build_object('type', 'test', 'timestamp', NOW()),                                                                     +
     'pending',                                                                                                                  +
     1,                                                                                                                          +
     NOW(),                                                                                                                      +
     NOW()                                                                                                                       +
   ) RETURNING id INTO v_message_id;                                                                                             +
                                                                                                                                 +
   RETURN v_message_id;                                                                                                          +
 END;                                                                                                                            +
 $function$                                                                                                                      +
 
(1 row)

