-- Create secure Slack messaging function using vault token
-- This replaces the hardcoded token approach with secure vault storage

CREATE OR REPLACE FUNCTION send_slack_message(
    p_channel_id TEXT,
    p_text TEXT DEFAULT NULL,
    p_blocks JSONB DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_slack_token TEXT;
    v_response RECORD;
    v_payload TEXT;
BEGIN
    -- Get Slack token from vault
    SELECT decrypted_secret INTO v_slack_token
    FROM vault.decrypted_secrets
    WHERE name = 'slack_token';
    
    IF v_slack_token IS NULL THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error', 'Slack token not found in vault'
        );
    END IF;
    
    -- Build payload
    IF p_blocks IS NOT NULL THEN
        v_payload := jsonb_build_object(
            'channel', p_channel_id,
            'blocks', p_blocks,
            'text', COALESCE(p_text, 'Art Battle Notification'),
            'unfurl_links', false,
            'unfurl_media', false
        )::text;
    ELSE
        v_payload := jsonb_build_object(
            'channel', p_channel_id,
            'text', COALESCE(p_text, 'Art Battle Notification'),
            'unfurl_links', false,
            'unfurl_media', false
        )::text;
    END IF;
    
    -- Send to Slack API
    SELECT * INTO v_response
    FROM http((
        'POST',
        'https://slack.com/api/chat.postMessage',
        ARRAY[http_header('authorization', 'Bearer ' || v_slack_token)],
        'application/json',
        v_payload
    )::http_request);
    
    -- Return response
    IF v_response.status >= 200 AND v_response.status < 300 THEN
        RETURN v_response.content::jsonb;
    ELSE
        RETURN jsonb_build_object(
            'ok', false,
            'error', 'HTTP ' || v_response.status,
            'details', v_response.content
        );
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error', 'Function error: ' || SQLERRM
        );
END;
$$;

-- Create function to send admin invitation notification
CREATE OR REPLACE FUNCTION send_admin_invitation_slack(
    p_email TEXT,
    p_level TEXT,
    p_invited_by TEXT,
    p_cities_access TEXT[] DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_slack_blocks JSONB;
    v_cities_text TEXT;
    v_result JSONB;
BEGIN
    -- Format cities access
    IF p_cities_access IS NOT NULL AND array_length(p_cities_access, 1) > 0 THEN
        v_cities_text := array_to_string(p_cities_access, ', ');
    ELSE
        v_cities_text := 'All cities';
    END IF;
    
    -- Build Slack blocks
    v_slack_blocks := jsonb_build_array(
        jsonb_build_object(
            'type', 'section',
            'text', jsonb_build_object(
                'type', 'mrkdwn',
                'text', ':key: *New Admin Invitation Sent*'
            )
        ),
        jsonb_build_object(
            'type', 'section',
            'fields', jsonb_build_array(
                jsonb_build_object(
                    'type', 'mrkdwn',
                    'text', '*Email:*\n' || p_email
                ),
                jsonb_build_object(
                    'type', 'mrkdwn', 
                    'text', '*Level:*\n' || upper(p_level)
                ),
                jsonb_build_object(
                    'type', 'mrkdwn',
                    'text', '*Invited By:*\n' || p_invited_by
                ),
                jsonb_build_object(
                    'type', 'mrkdwn',
                    'text', '*Cities Access:*\n' || v_cities_text
                )
            )
        )
    );
    
    IF p_notes IS NOT NULL AND LENGTH(trim(p_notes)) > 0 THEN
        v_slack_blocks := v_slack_blocks || jsonb_build_array(
            jsonb_build_object(
                'type', 'section',
                'text', jsonb_build_object(
                    'type', 'mrkdwn',
                    'text', '*Notes:*\n' || p_notes
                )
            )
        );
    END IF;
    
    -- Add footer
    v_slack_blocks := v_slack_blocks || jsonb_build_array(
        jsonb_build_object(
            'type', 'context',
            'elements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'mrkdwn',
                    'text', 'Art Battle Admin System • ' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI UTC')
                )
            )
        )
    );
    
    -- Send to website-notify channel (for admin system notifications)
    SELECT send_slack_message(
        'C04PQD0G5', -- website-notify channel ID 
        'New Admin Invitation: ' || p_email,
        v_slack_blocks
    ) INTO v_result;
    
    RETURN v_result;
END;
$$;

-- Create function to send admin confirmation notification
CREATE OR REPLACE FUNCTION send_admin_confirmation_slack(
    p_email TEXT,
    p_admin_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_slack_blocks JSONB;
    v_result JSONB;
BEGIN
    -- Build Slack blocks
    v_slack_blocks := jsonb_build_array(
        jsonb_build_object(
            'type', 'section',
            'text', jsonb_build_object(
                'type', 'mrkdwn',
                'text', ':white_check_mark: *Admin Account Activated*'
            )
        ),
        jsonb_build_object(
            'type', 'section',
            'fields', jsonb_build_array(
                jsonb_build_object(
                    'type', 'mrkdwn',
                    'text', '*Email:*\n' || p_email
                ),
                jsonb_build_object(
                    'type', 'mrkdwn',
                    'text', '*Status:*\nAccount successfully activated'
                )
            )
        ),
        jsonb_build_object(
            'type', 'context',
            'elements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'mrkdwn',
                    'text', 'Art Battle Admin System • ' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI UTC')
                )
            )
        )
    );
    
    -- Send to general channel
    SELECT send_slack_message(
        'C0337E73W', -- general channel ID
        'Admin Account Activated: ' || p_email,
        v_slack_blocks
    ) INTO v_result;
    
    RETURN v_result;
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION send_slack_message TO authenticated;
GRANT EXECUTE ON FUNCTION send_admin_invitation_slack TO authenticated;
GRANT EXECUTE ON FUNCTION send_admin_confirmation_slack TO authenticated;