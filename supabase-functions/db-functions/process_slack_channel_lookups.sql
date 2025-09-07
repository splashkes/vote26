                                                                              pg_get_functiondef                                                                              
------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.process_slack_channel_lookups(p_limit integer DEFAULT 10)                                                                                 +
  RETURNS TABLE(processed integer, resolved integer, failed integer)                                                                                                         +
  LANGUAGE plpgsql                                                                                                                                                           +
  SECURITY DEFINER                                                                                                                                                           +
 AS $function$                                                                                                                                                               +
 DECLARE                                                                                                                                                                     +
   v_notification RECORD;                                                                                                                                                    +
   v_processed INTEGER := 0;                                                                                                                                                 +
   v_resolved INTEGER := 0;                                                                                                                                                  +
   v_failed INTEGER := 0;                                                                                                                                                    +
   v_channel_id VARCHAR;                                                                                                                                                     +
   v_channel_name VARCHAR;                                                                                                                                                   +
   v_slack_token TEXT;                                                                                                                                                       +
   v_response RECORD;                                                                                                                                                        +
   v_api_response JSONB;                                                                                                                                                     +
   v_channels JSONB;                                                                                                                                                         +
   v_channel JSONB;                                                                                                                                                          +
   v_cursor TEXT := NULL;                                                                                                                                                    +
   v_has_more BOOLEAN := TRUE;                                                                                                                                               +
   v_page_count INTEGER := 0;                                                                                                                                                +
   v_total_channels INTEGER := 0;                                                                                                                                            +
 BEGIN                                                                                                                                                                       +
   -- Get Slack token from vault                                                                                                                                             +
   SELECT decrypted_secret INTO v_slack_token                                                                                                                                +
   FROM vault.decrypted_secrets                                                                                                                                              +
   WHERE name = 'slack_token';                                                                                                                                               +
                                                                                                                                                                             +
   IF v_slack_token IS NULL THEN                                                                                                                                             +
     RETURN QUERY SELECT 0, 0, 1;                                                                                                                                            +
     RETURN;                                                                                                                                                                 +
   END IF;                                                                                                                                                                   +
                                                                                                                                                                             +
   -- Process notifications needing channel lookup                                                                                                                           +
   FOR v_notification IN                                                                                                                                                     +
     SELECT id, payload                                                                                                                                                      +
     FROM slack_notifications                                                                                                                                                +
     WHERE status = 'pending_lookup'                                                                                                                                         +
       AND attempts < 3                                                                                                                                                      +
     ORDER BY created_at                                                                                                                                                     +
     LIMIT p_limit                                                                                                                                                           +
   LOOP                                                                                                                                                                      +
     v_processed := v_processed + 1;                                                                                                                                         +
     v_channel_name := v_notification.payload->>'channel_name';                                                                                                              +
     v_channel_id := NULL;                                                                                                                                                   +
                                                                                                                                                                             +
     BEGIN                                                                                                                                                                   +
       -- First check cache again (might have been updated by another process)                                                                                               +
       v_channel_id := get_cached_slack_channel(v_channel_name);                                                                                                             +
                                                                                                                                                                             +
       IF v_channel_id IS NOT NULL THEN                                                                                                                                      +
         -- Found in cache now, promote to pending                                                                                                                           +
         UPDATE slack_notifications                                                                                                                                          +
         SET status = 'pending',                                                                                                                                             +
             channel_id = v_channel_id,                                                                                                                                      +
             payload = payload - 'needs_channel_lookup' - 'channel_name',                                                                                                    +
             attempts = 0                                                                                                                                                    +
         WHERE id = v_notification.id;                                                                                                                                       +
                                                                                                                                                                             +
         v_resolved := v_resolved + 1;                                                                                                                                       +
         CONTINUE; -- Skip to next notification                                                                                                                              +
       END IF;                                                                                                                                                               +
                                                                                                                                                                             +
       -- IMPROVED: Make paginated API calls to find the channel                                                                                                             +
       v_cursor := NULL;                                                                                                                                                     +
       v_has_more := TRUE;                                                                                                                                                   +
       v_page_count := 0;                                                                                                                                                    +
       v_total_channels := 0;                                                                                                                                                +
                                                                                                                                                                             +
       WHILE v_has_more AND v_page_count < 10 LOOP  -- Safety limit: max 10 pages (10,000 channels)                                                                          +
         v_page_count := v_page_count + 1;                                                                                                                                   +
                                                                                                                                                                             +
         -- Build API URL with cursor if available                                                                                                                           +
         DECLARE                                                                                                                                                             +
           v_api_url TEXT;                                                                                                                                                   +
         BEGIN                                                                                                                                                               +
           v_api_url := 'https://slack.com/api/conversations.list?limit=1000&types=public_channel';                                                                          +
           IF v_cursor IS NOT NULL THEN                                                                                                                                      +
             v_api_url := v_api_url || '&cursor=' || v_cursor;                                                                                                               +
           END IF;                                                                                                                                                           +
                                                                                                                                                                             +
           SELECT * INTO v_response FROM http((                                                                                                                              +
             'GET',                                                                                                                                                          +
             v_api_url,                                                                                                                                                      +
             ARRAY[http_header('authorization', 'Bearer ' || v_slack_token)],                                                                                                +
             'application/json',                                                                                                                                             +
             ''                                                                                                                                                              +
           )::http_request);                                                                                                                                                 +
         END;                                                                                                                                                                +
                                                                                                                                                                             +
         IF v_response.status = 200 THEN                                                                                                                                     +
           v_api_response := v_response.content::jsonb;                                                                                                                      +
                                                                                                                                                                             +
           -- Check if API call was successful                                                                                                                               +
           IF v_api_response->>'ok' != 'true' THEN                                                                                                                           +
             RAISE NOTICE 'Slack API error for channel lookup: %', v_api_response->>'error';                                                                                 +
             EXIT; -- Break out of pagination loop                                                                                                                           +
           END IF;                                                                                                                                                           +
                                                                                                                                                                             +
           v_channels := v_api_response->'channels';                                                                                                                         +
           v_total_channels := v_total_channels + jsonb_array_length(v_channels);                                                                                            +
                                                                                                                                                                             +
           -- Search for the channel in this page                                                                                                                            +
           FOR v_channel IN SELECT jsonb_array_elements(v_channels)                                                                                                          +
           LOOP                                                                                                                                                              +
             -- Cache all channels we encounter for future lookups (bulk caching)                                                                                            +
             BEGIN                                                                                                                                                           +
               PERFORM update_slack_channel_cache(                                                                                                                           +
                 v_channel->>'name',                                                                                                                                         +
                 v_channel->>'id',                                                                                                                                           +
                 72  -- 72 hour cache                                                                                                                                        +
               );                                                                                                                                                            +
             EXCEPTION WHEN OTHERS THEN                                                                                                                                      +
               -- Continue even if individual cache update fails                                                                                                             +
               RAISE NOTICE 'Failed to cache channel %: %', v_channel->>'name', SQLERRM;                                                                                     +
             END;                                                                                                                                                            +
                                                                                                                                                                             +
             -- Check if this is the channel we're looking for                                                                                                               +
             IF (v_channel->>'name') = v_channel_name THEN                                                                                                                   +
               v_channel_id := v_channel->>'id';                                                                                                                             +
               RAISE NOTICE 'Found channel % with ID % on page %', v_channel_name, v_channel_id, v_page_count;                                                               +
             END IF;                                                                                                                                                         +
           END LOOP;                                                                                                                                                         +
                                                                                                                                                                             +
           -- Check if we found our channel                                                                                                                                  +
           IF v_channel_id IS NOT NULL THEN                                                                                                                                  +
             EXIT; -- Break out of pagination loop                                                                                                                           +
           END IF;                                                                                                                                                           +
                                                                                                                                                                             +
           -- Check for next page                                                                                                                                            +
           v_cursor := v_api_response->'response_metadata'->>'next_cursor';                                                                                                  +
           v_has_more := (v_cursor IS NOT NULL AND TRIM(v_cursor) != '');                                                                                                    +
                                                                                                                                                                             +
           RAISE NOTICE 'Channel lookup page %: % channels, cursor: %, has_more: %',                                                                                         +
                        v_page_count, jsonb_array_length(v_channels),                                                                                                        +
                        COALESCE(LEFT(v_cursor, 10) || '...', 'null'), v_has_more;                                                                                           +
                                                                                                                                                                             +
         ELSE                                                                                                                                                                +
           -- API error                                                                                                                                                      +
           RAISE NOTICE 'Slack API HTTP error %: %', v_response.status, v_response.content;                                                                                  +
           EXIT; -- Break out of pagination loop                                                                                                                             +
         END IF;                                                                                                                                                             +
       END LOOP;                                                                                                                                                             +
                                                                                                                                                                             +
       RAISE NOTICE 'Channel lookup completed: % pages searched, % total channels, found: %',                                                                                +
                    v_page_count, v_total_channels, (v_channel_id IS NOT NULL);                                                                                              +
                                                                                                                                                                             +
       -- Process results                                                                                                                                                    +
       IF v_channel_id IS NOT NULL THEN                                                                                                                                      +
         -- Found channel - already cached during search, update notification                                                                                                +
         UPDATE slack_notifications                                                                                                                                          +
         SET status = 'pending',                                                                                                                                             +
             channel_id = v_channel_id,                                                                                                                                      +
             payload = payload - 'needs_channel_lookup' - 'channel_name',                                                                                                    +
             attempts = 0                                                                                                                                                    +
         WHERE id = v_notification.id;                                                                                                                                       +
                                                                                                                                                                             +
         v_resolved := v_resolved + 1;                                                                                                                                       +
       ELSE                                                                                                                                                                  +
         -- Channel not found, increment attempts                                                                                                                            +
         UPDATE slack_notifications                                                                                                                                          +
         SET attempts = attempts + 1,                                                                                                                                        +
             last_attempt_at = NOW()                                                                                                                                         +
         WHERE id = v_notification.id;                                                                                                                                       +
                                                                                                                                                                             +
         -- If max attempts reached, fallback to general                                                                                                                     +
         IF (SELECT attempts FROM slack_notifications WHERE id = v_notification.id) >= 3 THEN                                                                                +
           -- Get general channel ID (should be cached)                                                                                                                      +
           v_channel_id := get_cached_slack_channel('general');                                                                                                              +
           IF v_channel_id IS NULL THEN                                                                                                                                      +
             v_channel_id := 'C0337E73W'; -- Hardcoded fallback                                                                                                              +
           END IF;                                                                                                                                                           +
                                                                                                                                                                             +
           UPDATE slack_notifications                                                                                                                                        +
           SET status = 'pending',                                                                                                                                           +
               channel_id = v_channel_id,                                                                                                                                    +
               payload = payload || jsonb_build_object(                                                                                                                      +
                 'text', '⚠️ Channel #' || v_channel_name || ' not found after searching ' || v_total_channels || ' channels. Routing to #general.\n\n' || (payload->>'text'),+
                 'fallback_used', true                                                                                                                                       +
               ) - 'needs_channel_lookup' - 'channel_name',                                                                                                                  +
               attempts = 0                                                                                                                                                  +
           WHERE id = v_notification.id;                                                                                                                                     +
                                                                                                                                                                             +
           v_resolved := v_resolved + 1;                                                                                                                                     +
         END IF;                                                                                                                                                             +
       END IF;                                                                                                                                                               +
                                                                                                                                                                             +
     EXCEPTION WHEN OTHERS THEN                                                                                                                                              +
       UPDATE slack_notifications                                                                                                                                            +
       SET status = 'failed',                                                                                                                                                +
           error = 'Lookup error: ' || SQLERRM                                                                                                                               +
       WHERE id = v_notification.id;                                                                                                                                         +
       v_failed := v_failed + 1;                                                                                                                                             +
     END;                                                                                                                                                                    +
   END LOOP;                                                                                                                                                                 +
                                                                                                                                                                             +
   RETURN QUERY SELECT v_processed, v_resolved, v_failed;                                                                                                                    +
 END;                                                                                                                                                                        +
 $function$                                                                                                                                                                  +
 
(1 row)

