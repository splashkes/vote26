-- Function to populate city channel cache using Slack API
CREATE OR REPLACE FUNCTION populate_city_channel_cache()
RETURNS TABLE(channel_name TEXT, channel_id TEXT, status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_slack_token TEXT;
    v_response RECORD;
    v_channels JSONB;
    v_channel JSONB;
    v_city_channels TEXT[] := ARRAY['toronto', 'montreal', 'nyc', 'vancouver', 'sydney', 'boston', 'seattle', 'ottawa', 'calgary', 'philadelphia'];
    v_city_name TEXT;
    v_found_channel JSONB;
BEGIN
    -- Get Slack token from vault
    SELECT decrypted_secret INTO v_slack_token
    FROM vault.decrypted_secrets
    WHERE name = 'slack_token';
    
    IF v_slack_token IS NULL THEN
        RETURN QUERY SELECT 'ERROR'::TEXT, ''::TEXT, 'Slack token not found in vault'::TEXT;
        RETURN;
    END IF;
    
    -- Get all channels from Slack API
    SELECT * INTO v_response FROM http((
        'GET',
        'https://slack.com/api/conversations.list?limit=1000&types=public_channel',
        ARRAY[http_header('authorization', 'Bearer ' || v_slack_token)],
        'application/json',
        ''
    )::http_request);
    
    IF v_response.status != 200 THEN
        RETURN QUERY SELECT 'ERROR'::TEXT, ''::TEXT, ('HTTP ' || v_response.status || ': ' || v_response.content)::TEXT;
        RETURN;
    END IF;
    
    v_channels := (v_response.content::jsonb)->'channels';
    
    -- Look for each city channel
    FOREACH v_city_name IN ARRAY v_city_channels
    LOOP
        v_found_channel := NULL;
        
        -- Search through all channels
        FOR v_channel IN SELECT jsonb_array_elements(v_channels)
        LOOP
            IF (v_channel->>'name') = v_city_name THEN
                v_found_channel := v_channel;
                EXIT;
            END IF;
        END LOOP;
        
        IF v_found_channel IS NOT NULL THEN
            -- Insert/update the channel cache
            INSERT INTO slack_channels (channel_name, channel_id, active, updated_at)
            VALUES (
                v_city_name, 
                v_found_channel->>'id', 
                true, 
                NOW()
            )
            ON CONFLICT (channel_name) 
            DO UPDATE SET 
                channel_id = EXCLUDED.channel_id,
                active = true,
                updated_at = NOW();
            
            RETURN QUERY SELECT v_city_name, (v_found_channel->>'id')::TEXT, 'CACHED'::TEXT;
        ELSE
            RETURN QUERY SELECT v_city_name, ''::TEXT, 'NOT_FOUND'::TEXT;
        END IF;
    END LOOP;
END;
$$;