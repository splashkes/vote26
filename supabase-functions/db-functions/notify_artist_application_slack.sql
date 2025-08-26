                                                 pg_get_functiondef                                                  
---------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.notify_artist_application_slack()                                                +
  RETURNS trigger                                                                                                   +
  LANGUAGE plpgsql                                                                                                  +
 AS $function$                                                                                                      +
 DECLARE                                                                                                            +
     artist_info RECORD;                                                                                            +
     event_info RECORD;                                                                                             +
     slack_channel TEXT;                                                                                            +
     slack_channel_id TEXT;                                                                                         +
     message_preview TEXT;                                                                                          +
     payload_data JSONB;                                                                                            +
     slack_blocks JSONB;                                                                                            +
     main_text TEXT;                                                                                                +
     header_text TEXT;                                                                                              +
     notification_text TEXT;                                                                                        +
     event_date TEXT;                                                                                               +
     city_name TEXT;                                                                                                +
     result_id UUID;                                                                                                +
     sample_image_url TEXT;                                                                                         +
 BEGIN                                                                                                              +
     BEGIN                                                                                                          +
         -- Validate required data exists                                                                           +
         IF NEW.artist_profile_id IS NULL OR NEW.event_eid IS NULL THEN                                             +
             RAISE NOTICE 'Slack notification skipped: missing required data for application %', NEW.id;            +
             RETURN NEW;                                                                                            +
         END IF;                                                                                                    +
                                                                                                                    +
         -- Get artist profile information                                                                          +
         SELECT ap.name, ap.bio, ap.city, ap.country                                                                +
         INTO artist_info                                                                                           +
         FROM artist_profiles ap                                                                                    +
         WHERE ap.id = NEW.artist_profile_id;                                                                       +
                                                                                                                    +
         IF NOT FOUND THEN                                                                                          +
             RAISE NOTICE 'Slack notification skipped: Artist profile % not found', NEW.artist_profile_id;          +
             RETURN NEW;                                                                                            +
         END IF;                                                                                                    +
                                                                                                                    +
         -- Get event information INCLUDING slack_channel and city                                                  +
         SELECT e.name, e.eid, e.event_start_datetime, e.id, e.slack_channel, c.name as city_name                   +
         INTO event_info                                                                                            +
         FROM events e                                                                                              +
         LEFT JOIN cities c ON e.city_id = c.id                                                                     +
         WHERE e.eid = NEW.event_eid;                                                                               +
                                                                                                                    +
         IF NOT FOUND THEN                                                                                          +
             RAISE NOTICE 'Slack notification skipped: Event % not found', NEW.event_eid;                           +
             RETURN NEW;                                                                                            +
         END IF;                                                                                                    +
                                                                                                                    +
         -- Format event date for header                                                                            +
         IF event_info.event_start_datetime IS NOT NULL THEN                                                        +
             event_date := TO_CHAR(event_info.event_start_datetime, 'Mon DD, YYYY');                                +
         ELSE                                                                                                       +
             event_date := 'TBD';                                                                                   +
         END IF;                                                                                                    +
                                                                                                                    +
         -- Get city name                                                                                           +
         city_name := COALESCE(event_info.city_name, 'Unknown City');                                               +
                                                                                                                    +
         -- Get first sample work image - simplified                                                                +
         sample_image_url := NULL;                                                                                  +
         BEGIN                                                                                                      +
             SELECT image_url                                                                                       +
             INTO sample_image_url                                                                                  +
             FROM get_unified_sample_works(NEW.artist_profile_id)                                                   +
             WHERE image_url IS NOT NULL                                                                            +
             LIMIT 1;                                                                                               +
         EXCEPTION                                                                                                  +
             WHEN OTHERS THEN                                                                                       +
                 RAISE NOTICE 'Error getting sample work for profile %: %', NEW.artist_profile_id, SQLERRM;         +
                 sample_image_url := NULL;                                                                          +
         END;                                                                                                       +
                                                                                                                    +
         -- Use event's slack_channel if set, otherwise fallback to artist-notify                                   +
         IF event_info.slack_channel IS NOT NULL AND TRIM(event_info.slack_channel) != '' THEN                      +
             slack_channel := TRIM(event_info.slack_channel);                                                       +
             -- Remove # prefix if present                                                                          +
             IF LEFT(slack_channel, 1) = '#' THEN                                                                   +
                 slack_channel := SUBSTRING(slack_channel FROM 2);                                                  +
             END IF;                                                                                                +
         ELSE                                                                                                       +
             slack_channel := 'artist-notify';                                                                      +
         END IF;                                                                                                    +
                                                                                                                    +
         -- Resolve channel ID directly                                                                             +
         slack_channel_id := resolve_slack_channel(slack_channel);                                                  +
                                                                                                                    +
         -- Use application message instead of bio                                                                  +
         IF NEW.message_to_producer IS NOT NULL AND LENGTH(TRIM(NEW.message_to_producer)) > 0 THEN                  +
             message_preview := LEFT(TRIM(NEW.message_to_producer), 150);                                           +
             IF LENGTH(NEW.message_to_producer) > 150 THEN                                                          +
                 message_preview := message_preview || '...';                                                       +
             END IF;                                                                                                +
         ELSE                                                                                                       +
             message_preview := '_No message provided_';                                                            +
         END IF;                                                                                                    +
                                                                                                                    +
         -- Header format: "ARTIST NAME applied to ABXXXX (CITY - DATE)"                                            +
         header_text := COALESCE(TRIM(artist_info.name), 'Unknown Artist') || ' applied to ' ||                     +
                        NEW.event_eid || ' (' || city_name || ' - ' || event_date || ')';                           +
                                                                                                                    +
         notification_text := COALESCE(TRIM(artist_info.name), 'Unknown Artist') || ' applied to ' || NEW.event_eid;+
                                                                                                                    +
         -- Clean main text format with application message                                                         +
         main_text := '*' || COALESCE(TRIM(artist_info.name), 'Unknown') || '* - Artist #' ||                       +
                      COALESCE(NEW.artist_number::TEXT, 'N/A') || E'\n' ||                                          +
                      COALESCE(TRIM(artist_info.city), 'Unknown') || ', ' ||                                        +
                      COALESCE(TRIM(artist_info.country), 'Unknown') || E'\n\n' ||                                  +
                      message_preview;                                                                              +
                                                                                                                    +
         -- Create simplified blocks                                                                                +
         slack_blocks := jsonb_build_array(                                                                         +
             jsonb_build_object(                                                                                    +
                 'type', 'header',                                                                                  +
                 'text', jsonb_build_object(                                                                        +
                     'type', 'plain_text',                                                                          +
                     'text', header_text,                                                                           +
                     'emoji', true                                                                                  +
                 )                                                                                                  +
             )                                                                                                      +
         );                                                                                                         +
                                                                                                                    +
         -- Add main section with optional image                                                                    +
         IF sample_image_url IS NOT NULL THEN                                                                       +
             -- Section with image accessory                                                                        +
             slack_blocks := slack_blocks || jsonb_build_array(                                                     +
                 jsonb_build_object(                                                                                +
                     'type', 'section',                                                                             +
                     'text', jsonb_build_object(                                                                    +
                         'type', 'mrkdwn',                                                                          +
                         'text', main_text                                                                          +
                     ),                                                                                             +
                     'accessory', jsonb_build_object(                                                               +
                         'type', 'image',                                                                           +
                         'image_url', sample_image_url,                                                             +
                         'alt_text', 'Sample artwork'                                                               +
                     )                                                                                              +
                 )                                                                                                  +
             );                                                                                                     +
         ELSE                                                                                                       +
             -- Section without image                                                                               +
             slack_blocks := slack_blocks || jsonb_build_array(                                                     +
                 jsonb_build_object(                                                                                +
                     'type', 'section',                                                                             +
                     'text', jsonb_build_object(                                                                    +
                         'type', 'mrkdwn',                                                                          +
                         'text', main_text                                                                          +
                     )                                                                                              +
                 )                                                                                                  +
             );                                                                                                     +
         END IF;                                                                                                    +
                                                                                                                    +
         -- Add context footer                                                                                      +
         slack_blocks := slack_blocks || jsonb_build_array(                                                         +
             jsonb_build_object(                                                                                    +
                 'type', 'context',                                                                                 +
                 'elements', jsonb_build_array(                                                                     +
                     jsonb_build_object(                                                                            +
                         'type', 'mrkdwn',                                                                          +
                         'text', '*Event:* ' || COALESCE(TRIM(event_info.name), NEW.event_eid) ||                   +
                                ' - *Applied:* ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI') || ' UTC'                  +
                     )                                                                                              +
                 )                                                                                                  +
             )                                                                                                      +
         );                                                                                                         +
                                                                                                                    +
         payload_data := jsonb_build_object(                                                                        +
             'blocks', slack_blocks,                                                                                +
             'text', notification_text,                                                                             +
             'artist_name', TRIM(artist_info.name),                                                                 +
             'artist_number', NEW.artist_number,                                                                    +
             'event_eid', NEW.event_eid,                                                                            +
             'event_slack_channel', slack_channel                                                                   +
         );                                                                                                         +
                                                                                                                    +
         -- Insert notification directly with resolved channel ID                                                   +
         IF slack_channel_id IS NOT NULL THEN                                                                       +
             -- Direct send with channel ID                                                                         +
             INSERT INTO slack_notifications (                                                                      +
                 event_id,                                                                                          +
                 channel_id,                                                                                        +
                 message_type,                                                                                      +
                 payload,                                                                                           +
                 status                                                                                             +
             ) VALUES (                                                                                             +
                 event_info.id,                                                                                     +
                 slack_channel_id,                                                                                  +
                 'artist_application',                                                                              +
                 payload_data,                                                                                      +
                 'pending'                                                                                          +
             ) RETURNING id INTO result_id;                                                                         +
                                                                                                                    +
             RAISE NOTICE 'Slack notification queued DIRECT for application %: %', NEW.id, result_id;               +
         ELSE                                                                                                       +
             -- Fallback to lookup                                                                                  +
             INSERT INTO slack_notifications (                                                                      +
                 event_id,                                                                                          +
                 channel_id,                                                                                        +
                 message_type,                                                                                      +
                 payload,                                                                                           +
                 status                                                                                             +
             ) VALUES (                                                                                             +
                 event_info.id,                                                                                     +
                 NULL,                                                                                              +
                 'artist_application',                                                                              +
                 payload_data || jsonb_build_object('channel_name', slack_channel, 'needs_channel_lookup', true),   +
                 'pending_lookup'                                                                                   +
             ) RETURNING id INTO result_id;                                                                         +
                                                                                                                    +
             RAISE NOTICE 'Slack notification queued LOOKUP for application %: %', NEW.id, result_id;               +
         END IF;                                                                                                    +
                                                                                                                    +
     EXCEPTION                                                                                                      +
         WHEN OTHERS THEN                                                                                           +
             RAISE NOTICE 'Slack notification error for application %: % - %', NEW.id, SQLSTATE, SQLERRM;           +
     END;                                                                                                           +
                                                                                                                    +
     RETURN NEW;                                                                                                    +
 END;                                                                                                               +
 $function$                                                                                                         +
 
(1 row)

