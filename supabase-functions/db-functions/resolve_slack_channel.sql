                                                        pg_get_functiondef                                                        
----------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.resolve_slack_channel(p_channel character varying)                                            +
  RETURNS character varying                                                                                                      +
  LANGUAGE plpgsql                                                                                                               +
  SECURITY DEFINER                                                                                                               +
 AS $function$                                                                                                                   +
 DECLARE                                                                                                                         +
     v_slack_token TEXT;                                                                                                         +
     v_response RECORD;                                                                                                          +
     v_channels JSONB;                                                                                                           +
     v_channel JSONB;                                                                                                            +
     v_clean_channel VARCHAR;                                                                                                    +
 BEGIN                                                                                                                           +
     -- If it already looks like a channel ID, return as-is                                                                      +
     IF p_channel ~ '^[CGD][0-9A-Z]+$' THEN                                                                                      +
         RETURN p_channel;                                                                                                       +
     END IF;                                                                                                                     +
                                                                                                                                 +
     -- Get token from vault                                                                                                     +
     SELECT decrypted_secret INTO v_slack_token                                                                                  +
     FROM vault.decrypted_secrets                                                                                                +
     WHERE name = 'slack_token';                                                                                                 +
                                                                                                                                 +
     IF v_slack_token IS NULL THEN                                                                                               +
         RETURN 'C0337E73W'; -- Fallback to #general                                                                             +
     END IF;                                                                                                                     +
                                                                                                                                 +
     -- Clean channel name (remove # if present)                                                                                 +
     v_clean_channel := LTRIM(p_channel, '#');                                                                                   +
                                                                                                                                 +
     -- Live API lookup with pagination handling                                                                                 +
     BEGIN                                                                                                                       +
         DECLARE                                                                                                                 +
             v_cursor TEXT := NULL;                                                                                              +
             v_api_url TEXT;                                                                                                     +
             v_api_response JSONB;                                                                                               +
         BEGIN                                                                                                                   +
             LOOP                                                                                                                +
                 -- Build API URL with cursor if we have one                                                                     +
                 IF v_cursor IS NOT NULL THEN                                                                                    +
                     v_api_url := 'https://slack.com/api/conversations.list?limit=1000&types=public_channel&cursor=' || v_cursor;+
                 ELSE                                                                                                            +
                     v_api_url := 'https://slack.com/api/conversations.list?limit=1000&types=public_channel';                    +
                 END IF;                                                                                                         +
                                                                                                                                 +
                 SELECT * INTO v_response FROM http((                                                                            +
                     'GET',                                                                                                      +
                     v_api_url,                                                                                                  +
                     ARRAY[http_header('authorization', 'Bearer ' || v_slack_token)],                                            +
                     'application/json',                                                                                         +
                     ''                                                                                                          +
                 )::http_request);                                                                                               +
                                                                                                                                 +
                 -- Check for successful response                                                                                +
                 IF v_response.status = 200 THEN                                                                                 +
                     v_api_response := v_response.content::jsonb;                                                                +
                     v_channels := v_api_response->'channels';                                                                   +
                                                                                                                                 +
                     -- Search through channels for exact name match                                                             +
                     FOR v_channel IN SELECT jsonb_array_elements(v_channels)                                                    +
                     LOOP                                                                                                        +
                         IF (v_channel->>'name') = v_clean_channel THEN                                                          +
                             RETURN v_channel->>'id';                                                                            +
                         END IF;                                                                                                 +
                     END LOOP;                                                                                                   +
                                                                                                                                 +
                     -- Check if there are more pages                                                                            +
                     v_cursor := v_api_response->'response_metadata'->>'next_cursor';                                            +
                     IF v_cursor IS NULL OR v_cursor = '' THEN                                                                   +
                         EXIT; -- No more pages                                                                                  +
                     END IF;                                                                                                     +
                 ELSE                                                                                                            +
                     EXIT; -- API error                                                                                          +
                 END IF;                                                                                                         +
             END LOOP;                                                                                                           +
         END;                                                                                                                    +
                                                                                                                                 +
     EXCEPTION WHEN OTHERS THEN                                                                                                  +
         -- On any error, fall back to general channel                                                                           +
         -- This ensures the calling function never breaks                                                                       +
     END;                                                                                                                        +
                                                                                                                                 +
     -- Default fallback to #general if channel not found or any error occurs                                                    +
     RETURN 'C0337E73W';                                                                                                         +
 END;                                                                                                                            +
 $function$                                                                                                                      +
 
(1 row)

