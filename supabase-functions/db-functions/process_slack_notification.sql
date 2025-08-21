                                                pg_get_functiondef                                                 
-------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.process_slack_notification(p_notification_id uuid)                             +
  RETURNS boolean                                                                                                 +
  LANGUAGE plpgsql                                                                                                +
 AS $function$                                                                                                    +
 DECLARE                                                                                                          +
   v_notification RECORD;                                                                                         +
   v_channel_name TEXT;                                                                                           +
   v_response RECORD;                                                                                             +
   v_success BOOLEAN := FALSE;                                                                                    +
   v_slack_payload TEXT;                                                                                          +
   v_slack_token TEXT := 'REDACTED_SLACK_BOT_TOKEN';                                +
 BEGIN                                                                                                            +
   -- Get and lock the notification                                                                               +
   SELECT * INTO v_notification                                                                                   +
   FROM slack_notifications                                                                                       +
   WHERE id = p_notification_id                                                                                   +
   FOR UPDATE;                                                                                                    +
                                                                                                                  +
   IF v_notification IS NULL OR v_notification.status NOT IN ('pending', 'pending_lookup') THEN                   +
     RETURN FALSE;                                                                                                +
   END IF;                                                                                                        +
                                                                                                                  +
   -- Update attempt count                                                                                        +
   UPDATE slack_notifications                                                                                     +
   SET attempts = attempts + 1, last_attempt_at = NOW()                                                           +
   WHERE id = p_notification_id;                                                                                  +
                                                                                                                  +
   BEGIN                                                                                                          +
     -- Get channel name from payload                                                                             +
     v_channel_name := v_notification.payload->>'channel_name';                                                   +
     IF v_channel_name IS NULL THEN                                                                               +
       v_channel_name := COALESCE(v_notification.channel_id, 'general');                                          +
     END IF;                                                                                                      +
                                                                                                                  +
     -- Prepare Slack API payload with blocks if available                                                        +
     IF v_notification.payload ? 'blocks' THEN                                                                    +
       -- Use blocks for rich formatting                                                                          +
       v_slack_payload := json_build_object(                                                                      +
         'channel', v_channel_name,                                                                               +
         'blocks', v_notification.payload->'blocks',                                                              +
         'text', v_notification.payload->>'text',  -- Fallback text                                               +
         'unfurl_links', false,                                                                                   +
         'unfurl_media', false                                                                                    +
       )::text;                                                                                                   +
     ELSE                                                                                                         +
       -- Fallback to plain text                                                                                  +
       v_slack_payload := json_build_object(                                                                      +
         'channel', v_channel_name,                                                                               +
         'text', v_notification.payload->>'text',                                                                 +
         'unfurl_links', false,                                                                                   +
         'unfurl_media', false                                                                                    +
       )::text;                                                                                                   +
     END IF;                                                                                                      +
                                                                                                                  +
     -- Call Slack API directly to post message                                                                   +
     SELECT * INTO v_response                                                                                     +
     FROM http((                                                                                                  +
       'POST',                                                                                                    +
       'https://slack.com/api/chat.postMessage',                                                                  +
       ARRAY[http_header('authorization', 'Bearer ' || v_slack_token)],                                           +
       'application/json',                                                                                        +
       v_slack_payload                                                                                            +
     )::http_request);                                                                                            +
                                                                                                                  +
     -- Check if the response indicates success (status 2xx)                                                      +
     IF v_response.status >= 200 AND v_response.status < 300 THEN                                                 +
       UPDATE slack_notifications                                                                                 +
       SET status = 'sent', sent_at = NOW()                                                                       +
       WHERE id = p_notification_id;                                                                              +
       v_success := TRUE;                                                                                         +
     ELSE                                                                                                         +
       UPDATE slack_notifications                                                                                 +
       SET status = 'failed',                                                                                     +
           error = 'Slack API HTTP ' || v_response.status || ': ' || COALESCE(v_response.content, 'Unknown error')+
       WHERE id = p_notification_id;                                                                              +
       v_success := FALSE;                                                                                        +
     END IF;                                                                                                      +
                                                                                                                  +
   EXCEPTION                                                                                                      +
     WHEN OTHERS THEN                                                                                             +
       UPDATE slack_notifications                                                                                 +
       SET status = 'failed', error = 'Exception: ' || SQLERRM                                                    +
       WHERE id = p_notification_id;                                                                              +
       v_success := FALSE;                                                                                        +
   END;                                                                                                           +
                                                                                                                  +
   RETURN v_success;                                                                                              +
 END;                                                                                                             +
 $function$                                                                                                       +
 
(1 row)

