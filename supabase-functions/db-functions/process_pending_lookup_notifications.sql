                                                     pg_get_functiondef                                                     
----------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.process_pending_lookup_notifications()                                                  +
  RETURNS TABLE(processed integer, resolved integer, failed integer)                                                       +
  LANGUAGE plpgsql                                                                                                         +
 AS $function$                                                                                                             +
 DECLARE                                                                                                                   +
   v_notification RECORD;                                                                                                  +
   v_processed INTEGER := 0;                                                                                               +
   v_resolved INTEGER := 0;                                                                                                +
   v_failed INTEGER := 0;                                                                                                  +
   v_channel_id VARCHAR;                                                                                                   +
   v_channel_name VARCHAR;                                                                                                 +
   v_error_message TEXT;                                                                                                   +
   v_original_message TEXT;                                                                                                +
   v_slack_response RECORD;                                                                                                +
   v_slack_token TEXT := 'REDACTED_SLACK_BOT_TOKEN';                                         +
   v_api_response TEXT;                                                                                                    +
 BEGIN                                                                                                                     +
   -- Process pending_lookup notifications                                                                                 +
   FOR v_notification IN                                                                                                   +
     SELECT id, payload                                                                                                    +
     FROM slack_notifications                                                                                              +
     WHERE status = 'pending_lookup'                                                                                       +
       AND attempts < 3                                                                                                    +
     ORDER BY created_at                                                                                                   +
     LIMIT 5                                                                                                               +
   LOOP                                                                                                                    +
     v_processed := v_processed + 1;                                                                                       +
     v_channel_name := v_notification.payload->>'channel_name';                                                            +
                                                                                                                           +
     BEGIN                                                                                                                 +
       -- Look up channel ID from cache first                                                                              +
       SELECT sc.channel_id INTO v_channel_id                                                                              +
       FROM slack_channels sc                                                                                              +
       WHERE sc.channel_name = v_channel_name;                                                                             +
                                                                                                                           +
       IF v_channel_id IS NOT NULL THEN                                                                                    +
         -- Channel found in cache, promote to pending                                                                     +
         UPDATE slack_notifications                                                                                        +
         SET status = 'pending',                                                                                           +
             channel_id = v_channel_id,                                                                                    +
             attempts = 0,                                                                                                 +
             last_attempt_at = NULL                                                                                        +
         WHERE id = v_notification.id;                                                                                     +
                                                                                                                           +
         v_resolved := v_resolved + 1;                                                                                     +
       ELSE                                                                                                                +
         -- Try Slack API lookup                                                                                           +
         SELECT content INTO v_api_response                                                                                +
         FROM http((                                                                                                       +
           'GET',                                                                                                          +
           'https://slack.com/api/conversations.list',                                                                     +
           ARRAY[http_header('authorization', 'Bearer ' || v_slack_token)],                                                +
           'application/json',                                                                                             +
           NULL                                                                                                            +
         )::http_request);                                                                                                 +
                                                                                                                           +
         -- Simple pattern matching to find channel ID (not perfect but functional)                                        +
         -- Look for pattern: "name":"channelname","id":"CXXXXXXXX"                                                        +
         IF v_api_response ~ ('"name":"' || v_channel_name || '","id":"[CGD][0-9A-Z]+"') THEN                              +
           -- Extract the channel ID using regex                                                                           +
           v_channel_id := substring(v_api_response from '"name":"' || v_channel_name || '","id":"([CGD][0-9A-Z]+)"');     +
                                                                                                                           +
           -- Cache the found channel                                                                                      +
           INSERT INTO slack_channels (channel_name, channel_id, workspace, active)                                        +
           VALUES (v_channel_name, v_channel_id, 'main', true)                                                             +
           ON CONFLICT DO NOTHING;                                                                                         +
                                                                                                                           +
           -- Promote notification to pending                                                                              +
           UPDATE slack_notifications                                                                                      +
           SET status = 'pending',                                                                                         +
               channel_id = v_channel_id,                                                                                  +
               attempts = 0,                                                                                               +
               last_attempt_at = NULL                                                                                      +
           WHERE id = v_notification.id;                                                                                   +
                                                                                                                           +
           v_resolved := v_resolved + 1;                                                                                   +
         ELSE                                                                                                              +
           -- Channel not found, increment attempts                                                                        +
           UPDATE slack_notifications                                                                                      +
           SET attempts = attempts + 1,                                                                                    +
               last_attempt_at = NOW()                                                                                     +
           WHERE id = v_notification.id;                                                                                   +
                                                                                                                           +
           -- If max attempts reached, fallback to general                                                                 +
           IF (SELECT attempts FROM slack_notifications WHERE id = v_notification.id) >= 3 THEN                            +
             -- Get original message                                                                                       +
             v_original_message := v_notification.payload->>'text';                                                        +
                                                                                                                           +
             -- Create error message                                                                                       +
             v_error_message := '⚠️ **CHANNEL LOOKUP FAILED**' || E'\n' ||                                                  +
                               'Could not find Slack channel for city: ' || COALESCE(v_channel_name, 'unknown') || E'\n' ||+
                               'Routing to #general instead.' || E'\n' ||                                                  +
                               E'\n' ||                                                                                    +
                               '--- Original Message ---' || E'\n' ||                                                      +
                               v_original_message;                                                                         +
                                                                                                                           +
             -- Route to general channel (look it up automatically too)                                                    +
             SELECT content INTO v_api_response                                                                            +
             FROM http((                                                                                                   +
               'GET',                                                                                                      +
               'https://slack.com/api/conversations.list',                                                                 +
               ARRAY[http_header('authorization', 'Bearer ' || v_slack_token)],                                            +
               'application/json',                                                                                         +
               NULL                                                                                                        +
             )::http_request);                                                                                             +
                                                                                                                           +
             -- Look for general channel                                                                                   +
             IF v_api_response ~ '"name":"general","id":"[CGD][0-9A-Z]+"' THEN                                             +
               v_channel_id := substring(v_api_response from '"name":"general","id":"([CGD][0-9A-Z]+)"');                  +
                                                                                                                           +
               -- Cache general channel                                                                                    +
               INSERT INTO slack_channels (channel_name, channel_id, workspace, active)                                    +
               VALUES ('general', v_channel_id, 'main', true)                                                              +
               ON CONFLICT DO NOTHING;                                                                                     +
             ELSE                                                                                                          +
               -- Ultimate fallback - use any available channel from the API response                                      +
               v_channel_id := substring(v_api_response from '"id":"([CGD][0-9A-Z]+)"');                                   +
             END IF;                                                                                                       +
                                                                                                                           +
             -- Update notification with error message and fallback channel                                                +
             UPDATE slack_notifications                                                                                    +
             SET status = 'pending',                                                                                       +
                 channel_id = v_channel_id,                                                                                +
                 payload = payload || jsonb_build_object('text', v_error_message, 'original_channel', v_channel_name),     +
                 attempts = 0,                                                                                             +
                 last_attempt_at = NULL                                                                                    +
             WHERE id = v_notification.id;                                                                                 +
                                                                                                                           +
             v_resolved := v_resolved + 1;                                                                                 +
           END IF;                                                                                                         +
         END IF;                                                                                                           +
       END IF;                                                                                                             +
                                                                                                                           +
     EXCEPTION                                                                                                             +
       WHEN OTHERS THEN                                                                                                    +
         UPDATE slack_notifications                                                                                        +
         SET status = 'failed',                                                                                            +
             error = 'Lookup error: ' || SQLERRM                                                                           +
         WHERE id = v_notification.id;                                                                                     +
         v_failed := v_failed + 1;                                                                                         +
     END;                                                                                                                  +
   END LOOP;                                                                                                               +
                                                                                                                           +
   RETURN QUERY SELECT v_processed, v_resolved, v_failed;                                                                  +
 END;                                                                                                                      +
 $function$                                                                                                                +
 
(1 row)

