                                                                             pg_get_functiondef                                                                             
----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.queue_notification_with_cache_only(p_event_id uuid, p_channel_name character varying, p_message_type character varying, p_payload jsonb)+
  RETURNS uuid                                                                                                                                                             +
  LANGUAGE plpgsql                                                                                                                                                         +
  SECURITY DEFINER                                                                                                                                                         +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                                                                                          +
 AS $function$                                                                                                                                                             +
  DECLARE                                                                                                                                                                  +
    v_channel_id VARCHAR;                                                                                                                                                  +
    v_notification_id UUID;                                                                                                                                                +
    v_clean_channel VARCHAR;                                                                                                                                               +
  BEGIN                                                                                                                                                                    +
    -- Clean channel name                                                                                                                                                  +
    v_clean_channel := LTRIM(p_channel_name, '#');                                                                                                                         +
                                                                                                                                                                           +
    -- Try to get channel ID from cache (fast lookup only)                                                                                                                 +
    v_channel_id := get_cached_slack_channel(v_clean_channel);                                                                                                             +
                                                                                                                                                                           +
    -- Always queue the notification - never block for API calls                                                                                                           +
    IF v_channel_id IS NOT NULL THEN                                                                                                                                       +
      -- Cache hit - queue with resolved channel ID for immediate processing                                                                                               +
      INSERT INTO slack_notifications (                                                                                                                                    +
        event_id,                                                                                                                                                          +
        channel_id,                                                                                                                                                        +
        message_type,                                                                                                                                                      +
        payload,                                                                                                                                                           +
        status                                                                                                                                                             +
      ) VALUES (                                                                                                                                                           +
        p_event_id,                                                                                                                                                        +
        v_channel_id,                                                                                                                                                      +
        p_message_type,                                                                                                                                                    +
        p_payload,                                                                                                                                                         +
        'pending' -- Ready for immediate processing                                                                                                                        +
      ) RETURNING id INTO v_notification_id;                                                                                                                               +
    ELSE                                                                                                                                                                   +
      -- Cache miss - queue with channel name for async lookup                                                                                                             +
      INSERT INTO slack_notifications (                                                                                                                                    +
        event_id,                                                                                                                                                          +
        channel_id,                                                                                                                                                        +
        message_type,                                                                                                                                                      +
        payload,                                                                                                                                                           +
        status                                                                                                                                                             +
      ) VALUES (                                                                                                                                                           +
        p_event_id,                                                                                                                                                        +
        NULL, -- No ID yet                                                                                                                                                 +
        p_message_type,                                                                                                                                                    +
        p_payload || jsonb_build_object(                                                                                                                                   +
          'channel_name', v_clean_channel,                                                                                                                                 +
          'needs_channel_lookup', true                                                                                                                                     +
        ),                                                                                                                                                                 +
        'pending_lookup' -- Needs background processing                                                                                                                    +
      ) RETURNING id INTO v_notification_id;                                                                                                                               +
    END IF;                                                                                                                                                                +
                                                                                                                                                                           +
    RETURN v_notification_id;                                                                                                                                              +
  END;                                                                                                                                                                     +
  $function$                                                                                                                                                               +
 
(1 row)

