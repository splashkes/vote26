                                                             pg_get_functiondef                                                              
---------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.send_slack_message(p_channel_id text, p_text text DEFAULT NULL::text, p_blocks jsonb DEFAULT NULL::jsonb)+
  RETURNS jsonb                                                                                                                             +
  LANGUAGE plpgsql                                                                                                                          +
  SECURITY DEFINER                                                                                                                          +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                                                           +
 AS $function$                                                                                                                              +
  DECLARE                                                                                                                                   +
      v_slack_token TEXT;                                                                                                                   +
      v_response RECORD;                                                                                                                    +
      v_payload TEXT;                                                                                                                       +
  BEGIN                                                                                                                                     +
      -- Get Slack token from vault                                                                                                         +
      SELECT decrypted_secret INTO v_slack_token                                                                                            +
      FROM vault.decrypted_secrets                                                                                                          +
      WHERE name = 'slack_token';                                                                                                           +
                                                                                                                                            +
      IF v_slack_token IS NULL THEN                                                                                                         +
          RETURN jsonb_build_object(                                                                                                        +
              'ok', false,                                                                                                                  +
              'error', 'Slack token not found in vault'                                                                                     +
          );                                                                                                                                +
      END IF;                                                                                                                               +
                                                                                                                                            +
      -- Build payload                                                                                                                      +
      IF p_blocks IS NOT NULL THEN                                                                                                          +
          v_payload := jsonb_build_object(                                                                                                  +
              'channel', p_channel_id,                                                                                                      +
              'blocks', p_blocks,                                                                                                           +
              'text', COALESCE(p_text, 'Art Battle Notification'),                                                                          +
              'unfurl_links', false,                                                                                                        +
              'unfurl_media', false                                                                                                         +
          )::text;                                                                                                                          +
      ELSE                                                                                                                                  +
          v_payload := jsonb_build_object(                                                                                                  +
              'channel', p_channel_id,                                                                                                      +
              'text', COALESCE(p_text, 'Art Battle Notification'),                                                                          +
              'unfurl_links', false,                                                                                                        +
              'unfurl_media', false                                                                                                         +
          )::text;                                                                                                                          +
      END IF;                                                                                                                               +
                                                                                                                                            +
      -- Send to Slack API                                                                                                                  +
      SELECT * INTO v_response                                                                                                              +
      FROM http((                                                                                                                           +
          'POST',                                                                                                                           +
          'https://slack.com/api/chat.postMessage',                                                                                         +
          ARRAY[http_header('authorization', 'Bearer ' || v_slack_token)],                                                                  +
          'application/json',                                                                                                               +
          v_payload                                                                                                                         +
      )::http_request);                                                                                                                     +
                                                                                                                                            +
      -- Return response                                                                                                                    +
      IF v_response.status >= 200 AND v_response.status < 300 THEN                                                                          +
          RETURN v_response.content::jsonb;                                                                                                 +
      ELSE                                                                                                                                  +
          RETURN jsonb_build_object(                                                                                                        +
              'ok', false,                                                                                                                  +
              'error', 'HTTP ' || v_response.status,                                                                                        +
              'details', v_response.content                                                                                                 +
          );                                                                                                                                +
      END IF;                                                                                                                               +
  EXCEPTION                                                                                                                                 +
      WHEN OTHERS THEN                                                                                                                      +
          RETURN jsonb_build_object(                                                                                                        +
              'ok', false,                                                                                                                  +
              'error', 'Function error: ' || SQLERRM                                                                                        +
          );                                                                                                                                +
  END;                                                                                                                                      +
  $function$                                                                                                                                +
 
(1 row)

