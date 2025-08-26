-- Integrate all notification systems to use the robust queue with real-time channel lookup

-- 1. Create unified notification queueing function
CREATE OR REPLACE FUNCTION queue_slack_notification(
    p_channel_name TEXT,
    p_message_type TEXT,
    p_text TEXT,
    p_blocks JSONB DEFAULT NULL,
    p_event_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_channel_id TEXT;
    v_notification_id UUID;
    v_payload JSONB;
BEGIN
    -- Resolve channel using real-time lookup
    v_channel_id := resolve_slack_channel(p_channel_name);
    
    -- Build payload
    v_payload := jsonb_build_object(
        'text', p_text,
        'channel_name', p_channel_name
    );
    
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
$$;

-- 2. Replace admin invitation function's direct Slack calls with queue
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
    v_notification_id UUID;
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
    
    -- Queue notification to general channel (admin notifications)
    SELECT queue_slack_notification(
        'general',
        'admin_invitation',
        'New Admin Invitation: ' || p_email,
        v_slack_blocks,
        NULL
    ) INTO v_notification_id;
    
    RETURN jsonb_build_object(
        'ok', true,
        'notification_id', v_notification_id,
        'queued_to', 'general'
    );
END;
$$;

-- 3. Replace admin confirmation function's direct Slack calls with queue
CREATE OR REPLACE FUNCTION send_admin_confirmation_slack(
    p_email TEXT,
    p_admin_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_slack_blocks JSONB;
    v_notification_id UUID;
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
    
    -- Queue notification to general channel
    SELECT queue_slack_notification(
        'general',
        'admin_confirmation',
        'Admin Account Activated: ' || p_email,
        v_slack_blocks,
        NULL
    ) INTO v_notification_id;
    
    RETURN jsonb_build_object(
        'ok', true,
        'notification_id', v_notification_id,
        'queued_to', 'general'
    );
END;
$$;

-- 4. Fix artist application notifications to use secure tokens and event channels
CREATE OR REPLACE FUNCTION notify_artist_application_slack()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    artist_info RECORD;
    event_info RECORD;
    slack_channel TEXT;
    bio_preview TEXT;
    slack_blocks JSONB;
    main_text TEXT;
    notification_id UUID;
BEGIN
    BEGIN
        -- Validate required data exists
        IF NEW.artist_profile_id IS NULL OR NEW.event_eid IS NULL THEN
            RAISE NOTICE 'Slack notification skipped: missing required data for application %', NEW.id;
            RETURN NEW;
        END IF;

        -- Get artist profile information
        SELECT ap.name, ap.bio, ap.city, ap.country
        INTO artist_info
        FROM artist_profiles ap
        WHERE ap.id = NEW.artist_profile_id;

        IF NOT FOUND THEN
            RAISE NOTICE 'Slack notification skipped: Artist profile % not found', NEW.artist_profile_id;
            RETURN NEW;
        END IF;

        -- Get event information INCLUDING slack_channel
        SELECT e.name, e.eid, e.event_start_datetime, e.id, e.slack_channel
        INTO event_info
        FROM events e
        WHERE e.eid = NEW.event_eid;

        IF NOT FOUND THEN
            RAISE NOTICE 'Slack notification skipped: Event % not found', NEW.event_eid;
            RETURN NEW;
        END IF;

        -- Determine Slack channel from event or fallback
        IF event_info.slack_channel IS NOT NULL AND LENGTH(TRIM(event_info.slack_channel)) > 0 THEN
            slack_channel := TRIM(event_info.slack_channel);
            -- Remove webhook URLs and # prefix to get clean channel name
            slack_channel := regexp_replace(slack_channel, '^https://hooks\.slack\.com.*$', 'general');
            slack_channel := LTRIM(slack_channel, '#');
        ELSE
            slack_channel := 'artist-notify';
        END IF;

        -- Build notification content
        IF artist_info.bio IS NOT NULL AND LENGTH(TRIM(artist_info.bio)) > 0 THEN
            bio_preview := LEFT(TRIM(artist_info.bio), 80);
            IF LENGTH(artist_info.bio) > 80 THEN
                bio_preview := bio_preview || '...';
            END IF;
        ELSE
            bio_preview := 'No bio provided';
        END IF;

        main_text := '*' || COALESCE(TRIM(artist_info.name), 'Unknown') || '* (#' || COALESCE(NEW.artist_number::TEXT, 'N/A') || ')' || E'\n' ||
                     bio_preview || E'\n' ||
                     COALESCE(TRIM(artist_info.city), 'Unknown') || ', ' || COALESCE(TRIM(artist_info.country), 'Unknown') || E'\n' ||
                     COALESCE(TRIM(event_info.name), NEW.event_eid) || ' - ' || COALESCE(TO_CHAR(event_info.event_start_datetime, 'Mon DD'), 'TBD');

        slack_blocks := jsonb_build_array(
            jsonb_build_object(
                'type', 'section',
                'text', jsonb_build_object(
                    'type', 'mrkdwn',
                    'text', ':art: *NEW APPLICATION*'
                )
            ),
            jsonb_build_object(
                'type', 'section',
                'text', jsonb_build_object(
                    'type', 'mrkdwn',
                    'text', main_text
                )
            )
        );

        -- Queue the notification using the robust system
        SELECT queue_slack_notification(
            slack_channel,
            'artist_application',
            'NEW APPLICATION: ' || COALESCE(TRIM(artist_info.name), 'Unknown'),
            slack_blocks,
            event_info.id
        ) INTO notification_id;

        RAISE NOTICE 'Artist application notification queued: % to channel: %', notification_id, slack_channel;

    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Slack notification error for application %: % - %', NEW.id, SQLSTATE, SQLERRM;
    END;

    RETURN NEW;
END;
$$;

-- 5. Fix artist invitation and confirmation notifications
CREATE OR REPLACE FUNCTION notify_artist_invitation_slack()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    artist_info RECORD;
    event_info RECORD;
    slack_channel TEXT;
    slack_blocks JSONB;
    main_text TEXT;
    notification_id UUID;
BEGIN
    BEGIN
        -- Get artist and event info (similar pattern to applications)
        SELECT ap.name, ap.city, ap.country
        INTO artist_info
        FROM artist_profiles ap
        WHERE ap.id = NEW.artist_profile_id;

        SELECT e.name, e.eid, e.id, e.slack_channel
        INTO event_info
        FROM events e
        WHERE e.eid = NEW.event_eid;

        -- Determine channel
        IF event_info.slack_channel IS NOT NULL AND LENGTH(TRIM(event_info.slack_channel)) > 0 THEN
            slack_channel := regexp_replace(TRIM(event_info.slack_channel), '^https://hooks\.slack\.com.*$', 'general');
            slack_channel := LTRIM(slack_channel, '#');
        ELSE
            slack_channel := 'artist-notify';
        END IF;

        main_text := ':email: *ARTIST INVITED*' || E'\n' ||
                     '*' || COALESCE(artist_info.name, 'Unknown') || '*' || E'\n' ||
                     COALESCE(artist_info.city, 'Unknown') || ', ' || COALESCE(artist_info.country, 'Unknown') || E'\n' ||
                     'Event: ' || COALESCE(event_info.name, NEW.event_eid);

        slack_blocks := jsonb_build_array(
            jsonb_build_object(
                'type', 'section',
                'text', jsonb_build_object(
                    'type', 'mrkdwn',
                    'text', main_text
                )
            )
        );

        SELECT queue_slack_notification(
            slack_channel,
            'artist_invitation',
            'ARTIST INVITED: ' || COALESCE(artist_info.name, 'Unknown'),
            slack_blocks,
            event_info.id
        ) INTO notification_id;

    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Slack notification error for invitation %: % - %', NEW.id, SQLSTATE, SQLERRM;
    END;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION notify_artist_confirmation_slack()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    artist_info RECORD;
    event_info RECORD;
    slack_channel TEXT;
    slack_blocks JSONB;
    main_text TEXT;
    notification_id UUID;
BEGIN
    BEGIN
        -- Get artist and event info
        SELECT ap.name, ap.city, ap.country
        INTO artist_info
        FROM artist_profiles ap
        WHERE ap.id = NEW.artist_profile_id;

        SELECT e.name, e.eid, e.id, e.slack_channel
        INTO event_info
        FROM events e
        WHERE e.eid = NEW.event_eid;

        -- Determine channel
        IF event_info.slack_channel IS NOT NULL AND LENGTH(TRIM(event_info.slack_channel)) > 0 THEN
            slack_channel := regexp_replace(TRIM(event_info.slack_channel), '^https://hooks\.slack\.com.*$', 'general');
            slack_channel := LTRIM(slack_channel, '#');
        ELSE
            slack_channel := 'artist-notify';
        END IF;

        main_text := ':white_check_mark: *ARTIST CONFIRMED*' || E'\n' ||
                     '*' || COALESCE(artist_info.name, 'Unknown') || '*' || E'\n' ||
                     COALESCE(artist_info.city, 'Unknown') || ', ' || COALESCE(artist_info.country, 'Unknown') || E'\n' ||
                     'Event: ' || COALESCE(event_info.name, NEW.event_eid);

        slack_blocks := jsonb_build_array(
            jsonb_build_object(
                'type', 'section',
                'text', jsonb_build_object(
                    'type', 'mrkdwn',
                    'text', main_text
                )
            )
        );

        SELECT queue_slack_notification(
            slack_channel,
            'artist_confirmation',
            'ARTIST CONFIRMED: ' || COALESCE(artist_info.name, 'Unknown'),
            slack_blocks,
            event_info.id
        ) INTO notification_id;

    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Slack notification error for confirmation %: % - %', NEW.id, SQLSTATE, SQLERRM;
    END;

    RETURN NEW;
END;
$$;