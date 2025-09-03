-- Fix syntax error in queue_slack_notification function
-- Simplified emoji implementation focusing on text only for now

CREATE OR REPLACE FUNCTION public.queue_slack_notification(p_channel_name text, p_message_type text, p_text text, p_blocks jsonb DEFAULT NULL::jsonb, p_event_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_channel_id TEXT;
    v_notification_id UUID;
    v_payload JSONB;
    v_emoji_text TEXT;
BEGIN
    -- Resolve channel using real-time lookup
    v_channel_id := resolve_slack_channel(p_channel_name);
    
    -- Add appropriate emoji based on message type
    CASE p_message_type
        WHEN 'artist_application' THEN 
            v_emoji_text := '📝 ' || p_text;
        WHEN 'artist_confirmation' THEN 
            v_emoji_text := '🎨 ' || p_text;
        WHEN 'invitation_accepted' THEN 
            v_emoji_text := '💥 ' || p_text;
        WHEN 'profile_update_success' THEN 
            v_emoji_text := '👤 ' || p_text;
        WHEN 'vote_cast' THEN 
            v_emoji_text := '🗳️ ' || p_text;
        WHEN 'withdrawal' THEN 
            v_emoji_text := '❌ ' || p_text;
        WHEN 'bid_placed' THEN 
            v_emoji_text := '💰 ' || p_text;
        ELSE 
            v_emoji_text := p_text; -- No emoji for unknown types
    END CASE;
    
    -- Build payload
    v_payload := jsonb_build_object(
        'text', v_emoji_text,
        'channel_name', p_channel_name
    );
    
    -- Add blocks as-is (emojis are already in the artist application function)
    IF p_blocks IS NOT NULL THEN
        v_payload := v_payload || jsonb_build_object('blocks', p_blocks);
    END IF;
    
    -- Queue the notification
    INSERT INTO slack_notifications (
        event_id,
        channel_id,
        message_type,
        payload,
        status,
        created_at
    ) VALUES (
        p_event_id,
        v_channel_id,
        p_message_type,
        v_payload,
        'pending',
        NOW()
    ) RETURNING id INTO v_notification_id;
    
    RETURN v_notification_id;
END;
$function$;

COMMENT ON FUNCTION queue_slack_notification(text, text, text, jsonb, uuid) IS 
'Enhanced Slack notification queuing with emoji prefixes:
📝 Applications | 🎨 Confirmations | 💥 Invitations | 👤 Profiles | 🗳️ Votes | ❌ Withdrawals | 💰 Bids
Automatically adds appropriate emoji to notification text based on message type.';