                                                                  pg_get_functiondef                                                                  
------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.notify_artist_application_slack()                                                                                 +
  RETURNS trigger                                                                                                                                    +
  LANGUAGE plpgsql                                                                                                                                   +
 AS $function$                                                                                                                                       +
 DECLARE                                                                                                                                             +
     artist_info RECORD;                                                                                                                             +
     event_info RECORD;                                                                                                                              +
     slack_channel TEXT;                                                                                                                             +
     slack_channel_id TEXT;                                                                                                                          +
     bio_preview TEXT;                                                                                                                               +
     payload_data JSONB;                                                                                                                             +
     slack_blocks JSONB;                                                                                                                             +
     main_text TEXT;                                                                                                                                 +
     result_id UUID;                                                                                                                                 +
 BEGIN                                                                                                                                               +
     BEGIN                                                                                                                                           +
         -- Validate required data exists                                                                                                            +
         IF NEW.artist_profile_id IS NULL OR NEW.event_eid IS NULL THEN                                                                              +
             RAISE NOTICE 'Slack notification skipped: missing required data for application %', NEW.id;                                             +
             RETURN NEW;                                                                                                                             +
         END IF;                                                                                                                                     +
                                                                                                                                                     +
         -- Get artist profile information                                                                                                           +
         SELECT ap.name, ap.bio, ap.city, ap.country                                                                                                 +
         INTO artist_info                                                                                                                            +
         FROM artist_profiles ap                                                                                                                     +
         WHERE ap.id = NEW.artist_profile_id;                                                                                                        +
                                                                                                                                                     +
         IF NOT FOUND THEN                                                                                                                           +
             RAISE NOTICE 'Slack notification skipped: Artist profile % not found', NEW.artist_profile_id;                                           +
             RETURN NEW;                                                                                                                             +
         END IF;                                                                                                                                     +
                                                                                                                                                     +
         -- Get event information INCLUDING slack_channel                                                                                            +
         SELECT e.name, e.eid, e.event_start_datetime, e.id, e.slack_channel                                                                         +
         INTO event_info                                                                                                                             +
         FROM events e                                                                                                                               +
         WHERE e.eid = NEW.event_eid;                                                                                                                +
                                                                                                                                                     +
         IF NOT FOUND THEN                                                                                                                           +
             RAISE NOTICE 'Slack notification skipped: Event % not found', NEW.event_eid;                                                            +
             RETURN NEW;                                                                                                                             +
         END IF;                                                                                                                                     +
                                                                                                                                                     +
         -- Use event's slack_channel if set, otherwise fallback to artist-notify                                                                    +
         IF event_info.slack_channel IS NOT NULL AND TRIM(event_info.slack_channel) != '' THEN                                                       +
             slack_channel := TRIM(event_info.slack_channel);                                                                                        +
         ELSE                                                                                                                                        +
             slack_channel := 'artist-notify';                                                                                                       +
         END IF;                                                                                                                                     +
                                                                                                                                                     +
         -- Resolve channel ID directly                                                                                                              +
         slack_channel_id := resolve_slack_channel(slack_channel);                                                                                   +
                                                                                                                                                     +
         -- Build notification content                                                                                                               +
         IF artist_info.bio IS NOT NULL AND LENGTH(TRIM(artist_info.bio)) > 0 THEN                                                                   +
             bio_preview := LEFT(TRIM(artist_info.bio), 80);                                                                                         +
             IF LENGTH(artist_info.bio) > 80 THEN                                                                                                    +
                 bio_preview := bio_preview || '...';                                                                                                +
             END IF;                                                                                                                                 +
         ELSE                                                                                                                                        +
             bio_preview := 'No bio provided';                                                                                                       +
         END IF;                                                                                                                                     +
                                                                                                                                                     +
         main_text := '*' || COALESCE(TRIM(artist_info.name), 'Unknown') || '* (#' || COALESCE(NEW.artist_number::TEXT, 'N/A') || ')' || E'\n' ||    +
                      bio_preview || E'\n' ||                                                                                                        +
                      COALESCE(TRIM(artist_info.city), 'Unknown') || ', ' || COALESCE(TRIM(artist_info.country), 'Unknown') || E'\n' ||              +
                      COALESCE(TRIM(event_info.name), NEW.event_eid) || ' - ' || COALESCE(TO_CHAR(event_info.event_start_datetime, 'Mon DD'), 'TBD');+
                                                                                                                                                     +
         slack_blocks := json_build_array(                                                                                                           +
             json_build_object(                                                                                                                      +
                 'type', 'section',                                                                                                                  +
                 'text', json_build_object(                                                                                                          +
                     'type', 'mrkdwn',                                                                                                               +
                     'text', ':art: *NEW APPLICATION*'                                                                                               +
                 )                                                                                                                                   +
             ),                                                                                                                                      +
             json_build_object(                                                                                                                      +
                 'type', 'section',                                                                                                                  +
                 'text', json_build_object(                                                                                                          +
                     'type', 'mrkdwn',                                                                                                               +
                     'text', main_text                                                                                                               +
                 )                                                                                                                                   +
             )                                                                                                                                       +
         );                                                                                                                                          +
                                                                                                                                                     +
         payload_data := jsonb_build_object(                                                                                                         +
             'blocks', slack_blocks,                                                                                                                 +
             'text', 'NEW APPLICATION: ' || COALESCE(TRIM(artist_info.name), 'Unknown'),                                                             +
             'artist_name', TRIM(artist_info.name),                                                                                                  +
             'artist_number', NEW.artist_number,                                                                                                     +
             'event_eid', NEW.event_eid,                                                                                                             +
             'event_slack_channel', slack_channel                                                                                                    +
         );                                                                                                                                          +
                                                                                                                                                     +
         -- Insert notification directly with resolved channel ID                                                                                    +
         IF slack_channel_id IS NOT NULL THEN                                                                                                        +
             -- Direct send with channel ID                                                                                                          +
             INSERT INTO slack_notifications (                                                                                                       +
                 event_id,                                                                                                                           +
                 channel_id,                                                                                                                         +
                 message_type,                                                                                                                       +
                 payload,                                                                                                                            +
                 status                                                                                                                              +
             ) VALUES (                                                                                                                              +
                 event_info.id,                                                                                                                      +
                 slack_channel_id,                                                                                                                   +
                 'artist_application',                                                                                                               +
                 payload_data,                                                                                                                       +
                 'pending'                                                                                                                           +
             ) RETURNING id INTO result_id;                                                                                                          +
                                                                                                                                                     +
             RAISE NOTICE 'Slack notification queued DIRECT for application %: %', NEW.id, result_id;                                                +
         ELSE                                                                                                                                        +
             -- Fallback to lookup                                                                                                                   +
             INSERT INTO slack_notifications (                                                                                                       +
                 event_id,                                                                                                                           +
                 channel_id,                                                                                                                         +
                 message_type,                                                                                                                       +
                 payload,                                                                                                                            +
                 status                                                                                                                              +
             ) VALUES (                                                                                                                              +
                 event_info.id,                                                                                                                      +
                 NULL,                                                                                                                               +
                 'artist_application',                                                                                                               +
                 payload_data || jsonb_build_object('channel_name', slack_channel, 'needs_channel_lookup', true),                                    +
                 'pending_lookup'                                                                                                                    +
             ) RETURNING id INTO result_id;                                                                                                          +
                                                                                                                                                     +
             RAISE NOTICE 'Slack notification queued LOOKUP for application %: %', NEW.id, result_id;                                                +
         END IF;                                                                                                                                     +
                                                                                                                                                     +
     EXCEPTION                                                                                                                                       +
         WHEN OTHERS THEN                                                                                                                            +
             RAISE NOTICE 'Slack notification error for application %: % - %', NEW.id, SQLSTATE, SQLERRM;                                            +
     END;                                                                                                                                            +
                                                                                                                                                     +
     RETURN NEW;                                                                                                                                     +
 END;                                                                                                                                                +
 $function$                                                                                                                                          +
 
(1 row)

