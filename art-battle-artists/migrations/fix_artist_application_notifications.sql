-- Fix artist application Slack notifications
-- 1. Change header from "🎨 New Artist Application" to "ARTIST NAME applied to ABXXXX on DATE"  
-- 2. Add sample works from get_unified_sample_works function

CREATE OR REPLACE FUNCTION public.notify_artist_application_slack()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    artist_info RECORD;
    event_info RECORD;
    sample_works JSONB;
    slack_channel TEXT;
    slack_channel_id TEXT;
    bio_preview TEXT;
    payload_data JSONB;
    slack_blocks JSONB;
    main_text TEXT;
    header_text TEXT;
    notification_text TEXT;
    event_date TEXT;
    result_id UUID;
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

        -- Format event date for header
        IF event_info.event_start_datetime IS NOT NULL THEN
            event_date := TO_CHAR(event_info.event_start_datetime, 'Mon DD, YYYY');
        ELSE
            event_date := 'TBD';
        END IF;

        -- Get sample works using the unified function
        BEGIN
            SELECT array_to_json(array_agg(row_to_json(works)))
            INTO sample_works
            FROM (
                SELECT image_url, title, source_type
                FROM get_unified_sample_works(NEW.artist_profile_id)
                WHERE image_url IS NOT NULL
                LIMIT 3
            ) works;
            
            IF sample_works IS NULL THEN
                sample_works := '[]'::jsonb;
            END IF;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Error getting sample works for profile %: %', NEW.artist_profile_id, SQLERRM;
                sample_works := '[]'::jsonb;
        END;

        -- Use event's slack_channel if set, otherwise fallback to artist-notify
        IF event_info.slack_channel IS NOT NULL AND TRIM(event_info.slack_channel) != '' THEN
            slack_channel := TRIM(event_info.slack_channel);
            -- Remove # prefix if present
            IF LEFT(slack_channel, 1) = '#' THEN
                slack_channel := SUBSTRING(slack_channel FROM 2);
            END IF;
        ELSE
            slack_channel := 'artist-notify';
        END IF;

        -- Resolve channel ID directly
        slack_channel_id := resolve_slack_channel(slack_channel);

        -- Build notification content
        IF artist_info.bio IS NOT NULL AND LENGTH(TRIM(artist_info.bio)) > 0 THEN
            bio_preview := LEFT(TRIM(artist_info.bio), 150);
            IF LENGTH(artist_info.bio) > 150 THEN
                bio_preview := bio_preview || '...';
            END IF;
        ELSE
            bio_preview := '_No artist statement provided._';
        END IF;

        -- NEW FORMAT: "ARTIST NAME applied to ABXXXX on DATE"
        header_text := COALESCE(TRIM(artist_info.name), 'Unknown Artist') || ' applied to ' || 
                       NEW.event_eid || ' on ' || event_date;
        
        notification_text := COALESCE(TRIM(artist_info.name), 'Unknown Artist') || ' applied to ' || NEW.event_eid;

        main_text := '*' || COALESCE(TRIM(artist_info.name), 'Unknown') || '* has applied to *' || 
                     NEW.event_eid || '* on ' || event_date || E'\n\n' ||
                     bio_preview || E'\n\n' ||
                     '*Location:* ' || COALESCE(TRIM(artist_info.city), 'Unknown') || ', ' || 
                     COALESCE(TRIM(artist_info.country), 'Unknown') || E'\n' ||
                     '*Artist Number:* #' || COALESCE(NEW.artist_number::TEXT, 'N/A');

        -- Create blocks with sample works if available
        slack_blocks := json_build_array(
            json_build_object(
                'type', 'header',
                'text', json_build_object(
                    'type', 'plain_text',
                    'text', header_text,
                    'emoji', true
                )
            ),
            json_build_object(
                'type', 'section',
                'text', json_build_object(
                    'type', 'mrkdwn',
                    'text', main_text
                )
            )
        );

        -- Add sample works section if we have any
        IF jsonb_array_length(sample_works) > 0 THEN
            -- Add a divider
            slack_blocks := slack_blocks || json_build_array(
                json_build_object('type', 'divider')
            );
            
            -- Add sample works header
            slack_blocks := slack_blocks || json_build_array(
                json_build_object(
                    'type', 'section',
                    'text', json_build_object(
                        'type', 'mrkdwn',
                        'text', '*Sample Works:*'
                    )
                )
            );
            
            -- Add images (up to 3)
            FOR i IN 0..LEAST(jsonb_array_length(sample_works) - 1, 2) LOOP
                slack_blocks := slack_blocks || json_build_array(
                    json_build_object(
                        'type', 'section',
                        'text', json_build_object(
                            'type', 'mrkdwn',
                            'text', COALESCE((sample_works->i->>'title'), 'Untitled Work')
                        ),
                        'accessory', json_build_object(
                            'type', 'image',
                            'image_url', sample_works->i->>'image_url',
                            'alt_text', COALESCE((sample_works->i->>'title'), 'Sample artwork')
                        )
                    )
                );
            END LOOP;
        END IF;

        -- Add context footer
        slack_blocks := slack_blocks || json_build_array(
            json_build_object(
                'type', 'context',
                'elements', json_build_array(
                    json_build_object(
                        'type', 'mrkdwn',
                        'text', '*Event:* ' || COALESCE(TRIM(event_info.name), NEW.event_eid) || 
                               ' • *Applied:* ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI') || ' UTC'
                    )
                )
            )
        );

        payload_data := jsonb_build_object(
            'blocks', slack_blocks,
            'text', notification_text,
            'artist_name', TRIM(artist_info.name),
            'artist_number', NEW.artist_number,
            'event_eid', NEW.event_eid,
            'event_slack_channel', slack_channel,
            'sample_works', sample_works
        );

        -- Insert notification directly with resolved channel ID
        IF slack_channel_id IS NOT NULL THEN
            -- Direct send with channel ID
            INSERT INTO slack_notifications (
                event_id,
                channel_id,
                message_type,
                payload,
                status
            ) VALUES (
                event_info.id,
                slack_channel_id,
                'artist_application',
                payload_data,
                'pending'
            ) RETURNING id INTO result_id;

            RAISE NOTICE 'Slack notification queued DIRECT for application %: %', NEW.id, result_id;
        ELSE
            -- Fallback to lookup
            INSERT INTO slack_notifications (
                event_id,
                channel_id,
                message_type,
                payload,
                status
            ) VALUES (
                event_info.id,
                NULL,
                'artist_application',
                payload_data || jsonb_build_object('channel_name', slack_channel, 'needs_channel_lookup', true),
                'pending_lookup'
            ) RETURNING id INTO result_id;

            RAISE NOTICE 'Slack notification queued LOOKUP for application %: %', NEW.id, result_id;
        END IF;

    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Slack notification error for application %: % - %', NEW.id, SQLSTATE, SQLERRM;
    END;

    RETURN NEW;
END;
$function$;