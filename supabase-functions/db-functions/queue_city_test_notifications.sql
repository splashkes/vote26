                                                   pg_get_functiondef                                                   
------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.queue_city_test_notifications()                                                     +
  RETURNS TABLE(city_name text, notification_id uuid, status text)                                                     +
  LANGUAGE plpgsql                                                                                                     +
 AS $function$                                                                                                         +
 DECLARE                                                                                                               +
     v_test_cities TEXT[] := ARRAY['toronto', 'montreal', 'nyc', 'vancouver', 'boston'];                               +
     v_city TEXT;                                                                                                      +
     v_channel_id TEXT;                                                                                                +
     v_notification_id UUID;                                                                                           +
     v_payload JSONB;                                                                                                  +
 BEGIN                                                                                                                 +
     FOREACH v_city IN ARRAY v_test_cities                                                                             +
     LOOP                                                                                                              +
         -- Resolve channel (this will do real-time lookup)                                                            +
         v_channel_id := resolve_slack_channel(v_city);                                                                +
                                                                                                                       +
         -- Build test message payload                                                                                 +
         v_payload := jsonb_build_object(                                                                              +
             'text', 'Test notification for ' || v_city || ' channel',                                                 +
             'channel_name', v_city,                                                                                   +
             'blocks', jsonb_build_array(                                                                              +
                 jsonb_build_object(                                                                                   +
                     'type', 'section',                                                                                +
                     'text', jsonb_build_object(                                                                       +
                         'type', 'mrkdwn',                                                                             +
                         'text', ':test_tube: *Test Notification*\n\nTesting queue system for ' || v_city || ' channel'+
                     )                                                                                                 +
                 )                                                                                                     +
             )                                                                                                         +
         );                                                                                                            +
                                                                                                                       +
         -- Queue the notification                                                                                     +
         INSERT INTO slack_notifications (                                                                             +
             channel_id,                                                                                               +
             message_type,                                                                                             +
             payload,                                                                                                  +
             status,                                                                                                   +
             created_at                                                                                                +
         ) VALUES (                                                                                                    +
             v_channel_id,                                                                                             +
             'test_city_notification',                                                                                 +
             v_payload,                                                                                                +
             'pending',                                                                                                +
             NOW()                                                                                                     +
         ) RETURNING id INTO v_notification_id;                                                                        +
                                                                                                                       +
         RETURN QUERY SELECT v_city, v_notification_id,                                                                +
             CASE WHEN v_channel_id = 'C0337E73W' THEN 'QUEUED_TO_GENERAL' ELSE 'QUEUED_TO_CITY' END;                  +
     END LOOP;                                                                                                         +
 END;                                                                                                                  +
 $function$                                                                                                            +
 
(1 row)

