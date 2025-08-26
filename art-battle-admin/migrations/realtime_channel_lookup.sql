-- Replace cache-based channel resolution with real-time API lookup
-- This eliminates cache invalidation problems and always returns current data

CREATE OR REPLACE FUNCTION resolve_slack_channel(p_channel VARCHAR)
RETURNS VARCHAR
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_slack_token TEXT;
    v_response RECORD;
    v_channels JSONB;
    v_channel JSONB;
    v_clean_channel VARCHAR;
BEGIN
    -- If it already looks like a channel ID, return as-is
    IF p_channel ~ '^[CGD][0-9A-Z]+$' THEN
        RETURN p_channel;
    END IF;
    
    -- Get token from vault
    SELECT decrypted_secret INTO v_slack_token
    FROM vault.decrypted_secrets
    WHERE name = 'slack_token';
    
    IF v_slack_token IS NULL THEN
        RETURN 'C0337E73W'; -- Fallback to #general
    END IF;
    
    -- Clean channel name (remove # if present)
    v_clean_channel := LTRIM(p_channel, '#');
    
    -- Live API lookup with pagination handling
    BEGIN
        DECLARE
            v_cursor TEXT := NULL;
            v_api_url TEXT;
            v_api_response JSONB;
        BEGIN
            LOOP
                -- Build API URL with cursor if we have one
                IF v_cursor IS NOT NULL THEN
                    v_api_url := 'https://slack.com/api/conversations.list?limit=1000&types=public_channel&cursor=' || v_cursor;
                ELSE
                    v_api_url := 'https://slack.com/api/conversations.list?limit=1000&types=public_channel';
                END IF;
                
                SELECT * INTO v_response FROM http((
                    'GET',
                    v_api_url,
                    ARRAY[http_header('authorization', 'Bearer ' || v_slack_token)],
                    'application/json',
                    ''
                )::http_request);
                
                -- Check for successful response
                IF v_response.status = 200 THEN
                    v_api_response := v_response.content::jsonb;
                    v_channels := v_api_response->'channels';
                    
                    -- Search through channels for exact name match
                    FOR v_channel IN SELECT jsonb_array_elements(v_channels)
                    LOOP
                        IF (v_channel->>'name') = v_clean_channel THEN
                            RETURN v_channel->>'id';
                        END IF;
                    END LOOP;
                    
                    -- Check if there are more pages
                    v_cursor := v_api_response->'response_metadata'->>'next_cursor';
                    IF v_cursor IS NULL OR v_cursor = '' THEN
                        EXIT; -- No more pages
                    END IF;
                ELSE
                    EXIT; -- API error
                END IF;
            END LOOP;
        END;
        
    EXCEPTION WHEN OTHERS THEN
        -- On any error, fall back to general channel
        -- This ensures the calling function never breaks
    END;
    
    -- Default fallback to #general if channel not found or any error occurs
    RETURN 'C0337E73W';
END;
$$;

-- Create a test function to verify city channel lookups work
CREATE OR REPLACE FUNCTION test_city_channel_lookups()
RETURNS TABLE(city_name TEXT, channel_id TEXT, status TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
    v_test_cities TEXT[] := ARRAY['toronto', 'montreal', 'nyc', 'vancouver', 'sydney'];
    v_city TEXT;
    v_result TEXT;
BEGIN
    FOREACH v_city IN ARRAY v_test_cities
    LOOP
        v_result := resolve_slack_channel(v_city);
        
        IF v_result = 'C0337E73W' THEN
            RETURN QUERY SELECT v_city, v_result, 'FALLBACK_TO_GENERAL';
        ELSE
            RETURN QUERY SELECT v_city, v_result, 'FOUND';
        END IF;
    END LOOP;
END;
$$;

-- Create a function to queue test notifications to city channels
CREATE OR REPLACE FUNCTION queue_city_test_notifications()
RETURNS TABLE(city_name TEXT, notification_id UUID, status TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
    v_test_cities TEXT[] := ARRAY['toronto', 'montreal', 'nyc', 'vancouver', 'boston'];
    v_city TEXT;
    v_channel_id TEXT;
    v_notification_id UUID;
    v_payload JSONB;
BEGIN
    FOREACH v_city IN ARRAY v_test_cities
    LOOP
        -- Resolve channel (this will do real-time lookup)
        v_channel_id := resolve_slack_channel(v_city);
        
        -- Build test message payload
        v_payload := jsonb_build_object(
            'text', 'Test notification for ' || v_city || ' channel',
            'channel_name', v_city,
            'blocks', jsonb_build_array(
                jsonb_build_object(
                    'type', 'section',
                    'text', jsonb_build_object(
                        'type', 'mrkdwn',
                        'text', ':test_tube: *Test Notification*\n\nTesting queue system for ' || v_city || ' channel'
                    )
                )
            )
        );
        
        -- Queue the notification
        INSERT INTO slack_notifications (
            channel_id,
            message_type,
            payload,
            status,
            created_at
        ) VALUES (
            v_channel_id,
            'test_city_notification',
            v_payload,
            'pending',
            NOW()
        ) RETURNING id INTO v_notification_id;
        
        RETURN QUERY SELECT v_city, v_notification_id, 
            CASE WHEN v_channel_id = 'C0337E73W' THEN 'QUEUED_TO_GENERAL' ELSE 'QUEUED_TO_CITY' END;
    END LOOP;
END;
$$;