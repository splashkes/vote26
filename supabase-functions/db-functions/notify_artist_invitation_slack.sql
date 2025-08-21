                                                                                              pg_get_functiondef                                                                                               
---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.notify_artist_invitation_slack()                                                                                                                                           +
  RETURNS trigger                                                                                                                                                                                             +
  LANGUAGE plpgsql                                                                                                                                                                                            +
 AS $function$                                                                                                                                                                                                +
 DECLARE                                                                                                                                                                                                      +
     artist_info RECORD;                                                                                                                                                                                      +
     event_info RECORD;                                                                                                                                                                                       +
     slack_channel TEXT;                                                                                                                                                                                      +
     slack_channel_id TEXT;                                                                                                                                                                                   +
     payload_data JSONB;                                                                                                                                                                                      +
     slack_blocks JSONB;                                                                                                                                                                                      +
     main_text TEXT;                                                                                                                                                                                          +
     result_id UUID;                                                                                                                                                                                          +
 BEGIN                                                                                                                                                                                                        +
     BEGIN                                                                                                                                                                                                    +
         IF NEW.artist_profile_id IS NULL OR NEW.event_eid IS NULL THEN                                                                                                                                       +
             RAISE NOTICE 'Slack notification skipped: missing required data for invitation %', NEW.id;                                                                                                       +
             RETURN NEW;                                                                                                                                                                                      +
         END IF;                                                                                                                                                                                              +
                                                                                                                                                                                                              +
         SELECT ap.name, ap.city, ap.country INTO artist_info FROM artist_profiles ap WHERE ap.id = NEW.artist_profile_id;                                                                                    +
         IF NOT FOUND THEN RETURN NEW; END IF;                                                                                                                                                                +
                                                                                                                                                                                                              +
         SELECT e.name, e.eid, e.event_start_datetime, e.id, e.slack_channel INTO event_info FROM events e WHERE e.eid = NEW.event_eid;                                                                       +
         IF NOT FOUND THEN RETURN NEW; END IF;                                                                                                                                                                +
                                                                                                                                                                                                              +
         slack_channel := COALESCE(NULLIF(TRIM(event_info.slack_channel), ''), 'artist-notify');                                                                                                              +
         slack_channel_id := resolve_slack_channel(slack_channel);                                                                                                                                            +
                                                                                                                                                                                                              +
         main_text := '*' || COALESCE(TRIM(artist_info.name), 'Unknown') || '* (#' || COALESCE(NEW.artist_number::TEXT, 'N/A') || ')' || E'\n' ||                                                             +
                      COALESCE(TRIM(event_info.name), NEW.event_eid) || ' - ' || COALESCE(TO_CHAR(event_info.event_start_datetime, 'Mon DD'), 'TBD');                                                         +
                                                                                                                                                                                                              +
         slack_blocks := json_build_array(                                                                                                                                                                    +
             json_build_object('type', 'section', 'text', json_build_object('type', 'mrkdwn', 'text', ':email: *INVITATION SENT*')),                                                                          +
             json_build_object('type', 'section', 'text', json_build_object('type', 'mrkdwn', 'text', main_text))                                                                                             +
         );                                                                                                                                                                                                   +
                                                                                                                                                                                                              +
         payload_data := jsonb_build_object(                                                                                                                                                                  +
             'blocks', slack_blocks,                                                                                                                                                                          +
             'text', 'INVITATION SENT: ' || COALESCE(TRIM(artist_info.name), 'Unknown'),                                                                                                                      +
             'artist_name', TRIM(artist_info.name),                                                                                                                                                           +
             'artist_number', NEW.artist_number,                                                                                                                                                              +
             'event_eid', NEW.event_eid,                                                                                                                                                                      +
             'event_slack_channel', slack_channel                                                                                                                                                             +
         );                                                                                                                                                                                                   +
                                                                                                                                                                                                              +
         IF slack_channel_id IS NOT NULL THEN                                                                                                                                                                 +
             INSERT INTO slack_notifications (event_id, channel_id, message_type, payload, status)                                                                                                            +
             VALUES (event_info.id, slack_channel_id, 'artist_invitation', payload_data, 'pending') RETURNING id INTO result_id;                                                                              +
             RAISE NOTICE 'Slack notification queued DIRECT for invitation %: %', NEW.id, result_id;                                                                                                          +
         ELSE                                                                                                                                                                                                 +
             INSERT INTO slack_notifications (event_id, channel_id, message_type, payload, status)                                                                                                            +
             VALUES (event_info.id, NULL, 'artist_invitation', payload_data || jsonb_build_object('channel_name', slack_channel, 'needs_channel_lookup', true), 'pending_lookup') RETURNING id INTO result_id;+
             RAISE NOTICE 'Slack notification queued LOOKUP for invitation %: %', NEW.id, result_id;                                                                                                          +
         END IF;                                                                                                                                                                                              +
                                                                                                                                                                                                              +
     EXCEPTION WHEN OTHERS THEN                                                                                                                                                                               +
         RAISE NOTICE 'Slack notification error for invitation %: % - %', NEW.id, SQLSTATE, SQLERRM;                                                                                                          +
     END;                                                                                                                                                                                                     +
     RETURN NEW;                                                                                                                                                                                              +
 END;                                                                                                                                                                                                         +
 $function$                                                                                                                                                                                                   +
 
(1 row)

