                                                          pg_get_functiondef                                                          
--------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.notify_artist_invitation_slack()                                                                  +
  RETURNS trigger                                                                                                                    +
  LANGUAGE plpgsql                                                                                                                   +
 AS $function$                                                                                                                       +
 DECLARE                                                                                                                             +
     artist_info RECORD;                                                                                                             +
     event_info RECORD;                                                                                                              +
     admin_info RECORD;                                                                                                              +
     slack_channel TEXT;                                                                                                             +
     slack_blocks JSONB;                                                                                                             +
     notification_id UUID;                                                                                                           +
     invitation_message TEXT;                                                                                                        +
     formatted_message TEXT;                                                                                                         +
 BEGIN                                                                                                                               +
     BEGIN                                                                                                                           +
         -- Get artist profile information                                                                                           +
         SELECT ap.name, ap.city, ap.country, ap.bio                                                                                 +
         INTO artist_info                                                                                                            +
         FROM artist_profiles ap                                                                                                     +
         WHERE ap.id = NEW.artist_profile_id;                                                                                        +
                                                                                                                                     +
         -- Get event information using event_eid                                                                                    +
         SELECT e.name, e.eid, e.event_start_datetime, e.id, e.slack_channel                                                         +
         INTO event_info                                                                                                             +
         FROM events e                                                                                                               +
         WHERE e.eid = NEW.event_eid;                                                                                                +
                                                                                                                                     +
         -- Get admin who sent the invitation                                                                                        +
         SELECT u.email as admin_email                                                                                               +
         INTO admin_info                                                                                                             +
         FROM auth.users u                                                                                                           +
         WHERE u.id = NEW.invited_by_admin;                                                                                          +
                                                                                                                                     +
         -- Determine Slack channel from event or fallback                                                                           +
         IF event_info.slack_channel IS NOT NULL AND LENGTH(TRIM(event_info.slack_channel)) > 0 THEN                                 +
             slack_channel := regexp_replace(TRIM(event_info.slack_channel), '^https://hooks\.slack\.com.*$', 'general');            +
             slack_channel := LTRIM(slack_channel, '#');                                                                             +
         ELSE                                                                                                                        +
             slack_channel := 'artist-notify';                                                                                       +
         END IF;                                                                                                                     +
                                                                                                                                     +
         -- Get and format invitation message                                                                                        +
         invitation_message := COALESCE(NEW.message_from_producer, 'Standard invitation sent');                                      +
                                                                                                                                     +
         -- Format the message properly - replace literal \n with actual line breaks and handle special characters                   +
         formatted_message := regexp_replace(invitation_message, '\\n', E'\n', 'g');                                                 +
         formatted_message := replace(formatted_message, '\!', '!');                                                                 +
         formatted_message := replace(formatted_message, '\?', '?');                                                                 +
                                                                                                                                     +
         -- Truncate if too long                                                                                                     +
         IF LENGTH(formatted_message) > 300 THEN                                                                                     +
             formatted_message := LEFT(formatted_message, 300) || '...';                                                             +
         END IF;                                                                                                                     +
                                                                                                                                     +
         -- Build rich Slack blocks with artist name as title                                                                        +
         slack_blocks := jsonb_build_array(                                                                                          +
             -- Header block with artist name and event                                                                              +
             jsonb_build_object(                                                                                                     +
                 'type', 'header',                                                                                                   +
                 'text', jsonb_build_object(                                                                                         +
                     'type', 'plain_text',                                                                                           +
                     'text', COALESCE(TRIM(artist_info.name), 'Artist') || ' invited to ' || COALESCE(TRIM(event_info.eid), 'Event'),+
                     'emoji', true                                                                                                   +
                 )                                                                                                                   +
             ),                                                                                                                      +
             -- Main section with producer message                                                                                   +
             jsonb_build_object(                                                                                                     +
                 'type', 'section',                                                                                                  +
                 'text', jsonb_build_object(                                                                                         +
                     'type', 'mrkdwn',                                                                                               +
                     'text', '*Producer Message:*' || E'\n' || formatted_message                                                     +
                 )                                                                                                                   +
             ),                                                                                                                      +
             -- Artist details section                                                                                               +
             jsonb_build_object(                                                                                                     +
                 'type', 'section',                                                                                                  +
                 'fields', jsonb_build_array(                                                                                        +
                     jsonb_build_object(                                                                                             +
                         'type', 'mrkdwn',                                                                                           +
                         'text', '*Location:*' || E'\n' ||                                                                           +
                                 COALESCE(TRIM(artist_info.city), 'Unknown') || ', ' ||                                              +
                                 COALESCE(TRIM(artist_info.country), 'Unknown')                                                      +
                     ),                                                                                                              +
                     jsonb_build_object(                                                                                             +
                         'type', 'mrkdwn',                                                                                           +
                         'text', '*Invited By:*' || E'\n' ||                                                                         +
                                 COALESCE(admin_info.admin_email, 'System')                                                          +
                     )                                                                                                               +
                 )                                                                                                                   +
             ),                                                                                                                      +
             -- Context with event details                                                                                           +
             jsonb_build_object(                                                                                                     +
                 'type', 'context',                                                                                                  +
                 'elements', jsonb_build_array(                                                                                      +
                     jsonb_build_object(                                                                                             +
                         'type', 'mrkdwn',                                                                                           +
                         'text', '*Event:* ' || COALESCE(event_info.name, 'Unknown Event') || ' • ' ||                               +
                                 COALESCE(TO_CHAR(event_info.event_start_datetime, 'Month DD, YYYY'), 'TBD') ||                      +
                                 ' • *Invited:* ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI UTC')                                        +
                     )                                                                                                               +
                 )                                                                                                                   +
             )                                                                                                                       +
         );                                                                                                                          +
                                                                                                                                     +
         -- Queue the notification                                                                                                   +
         SELECT queue_slack_notification(                                                                                            +
             slack_channel,                                                                                                          +
             'artist_invitation',                                                                                                    +
             COALESCE(TRIM(artist_info.name), 'Artist') || ' invited to ' || COALESCE(TRIM(event_info.eid), 'Event'),                +
             slack_blocks,                                                                                                           +
             event_info.id                                                                                                           +
         ) INTO notification_id;                                                                                                     +
                                                                                                                                     +
         RAISE NOTICE 'Rich artist invitation notification queued: % to channel: %', notification_id, slack_channel;                 +
                                                                                                                                     +
     EXCEPTION                                                                                                                       +
         WHEN OTHERS THEN                                                                                                            +
             RAISE NOTICE 'Slack notification error for invitation %: % - %', NEW.id, SQLSTATE, SQLERRM;                             +
     END;                                                                                                                            +
                                                                                                                                     +
     RETURN NEW;                                                                                                                     +
 END;                                                                                                                                +
 $function$                                                                                                                          +
 
(1 row)

