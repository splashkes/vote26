                                                          pg_get_functiondef                                                           
---------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.notify_artist_invitation_slack()                                                                   +
  RETURNS trigger                                                                                                                     +
  LANGUAGE plpgsql                                                                                                                    +
 AS $function$                                                                                                                        +
  DECLARE                                                                                                                             +
      artist_info RECORD;                                                                                                             +
      event_info RECORD;                                                                                                              +
      sent_by_email TEXT;                                                                                                             +
      slack_channel TEXT;                                                                                                             +
      slack_blocks JSONB;                                                                                                             +
      notification_id UUID;                                                                                                           +
      invitation_message TEXT;                                                                                                        +
      formatted_message TEXT;                                                                                                         +
      email_status_text TEXT;                                                                                                         +
      email_status_emoji TEXT;                                                                                                        +
      email_source TEXT;                                                                                                              +
  BEGIN                                                                                                                               +
      BEGIN                                                                                                                           +
          -- Get artist profile information including email from ALL possible sources                                                 +
          SELECT ap.name, ap.city, ap.country, ap.bio,                                                                                +
                 ap.email as profile_email,                                                                                           +
                 p.email as people_email,                                                                                             +
                 au.email as auth_email,                                                                                              +
                 COALESCE(ap.email, p.email, au.email) as final_email                                                                 +
          INTO artist_info                                                                                                            +
          FROM artist_profiles ap                                                                                                     +
          LEFT JOIN people p ON ap.person_id = p.id                                                                                   +
          LEFT JOIN auth.users au ON p.auth_user_id = au.id                                                                           +
          WHERE ap.id = NEW.artist_profile_id;                                                                                        +
                                                                                                                                      +
          -- Get event information using event_eid                                                                                    +
          SELECT e.name, e.eid, e.event_start_datetime, e.id, e.slack_channel                                                         +
          INTO event_info                                                                                                             +
          FROM events e                                                                                                               +
          WHERE e.eid = NEW.event_eid;                                                                                                +
                                                                                                                                      +
          -- Get admin who sent the invitation from metadata                                                                          +
          sent_by_email := COALESCE(NEW.metadata->>'sent_by', 'System');                                                              +
                                                                                                                                      +
          -- Determine email status and source with detailed information                                                              +
          IF artist_info.final_email IS NULL THEN                                                                                     +
              email_status_text := 'No Email Found';                                                                                  +
              email_status_emoji := '❌';                                                                                              +
              email_source := 'Checked: profile, people, auth - all NULL';                                                            +
          ELSIF event_info IS NULL THEN                                                                                               +
              email_status_text := 'No Event Info';                                                                                   +
              email_status_emoji := '❌';                                                                                              +
              email_source := 'Email available but missing event';                                                                    +
          ELSE                                                                                                                        +
              -- Determine which email source was used                                                                                +
              IF artist_info.profile_email IS NOT NULL THEN                                                                           +
                  email_source := 'from artist_profiles.email';                                                                       +
              ELSIF artist_info.people_email IS NOT NULL THEN                                                                         +
                  email_source := 'from people.email';                                                                                +
              ELSIF artist_info.auth_email IS NOT NULL THEN                                                                           +
                  email_source := 'from auth.users.email';                                                                            +
              ELSE                                                                                                                    +
                  email_source := 'unknown source';                                                                                   +
              END IF;                                                                                                                 +
                                                                                                                                      +
              email_status_text := 'Email Sent';                                                                                      +
              email_status_emoji := '📤';                                                                                              +
          END IF;                                                                                                                     +
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
          formatted_message := regexp_replace(invitation_message, '\\n', E'\n', 'g');                                                 +
          formatted_message := replace(formatted_message, '\\!', '\!');                                                               +
          formatted_message := replace(formatted_message, '\?', '?');                                                                 +
                                                                                                                                      +
          -- Truncate if too long                                                                                                     +
          IF LENGTH(formatted_message) > 300 THEN                                                                                     +
              formatted_message := LEFT(formatted_message, 300) || '...';                                                             +
          END IF;                                                                                                                     +
                                                                                                                                      +
          -- Build rich Slack blocks with comprehensive email status                                                                  +
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
              -- Email status alert section with detailed information                                                                 +
              jsonb_build_object(                                                                                                     +
                  'type', 'section',                                                                                                  +
                  'text', jsonb_build_object(                                                                                         +
                      'type', 'mrkdwn',                                                                                               +
                      'text', email_status_emoji || ' *Email Status:* ' || email_status_text || E'\n' ||                              +
                             '*Email:* ' || COALESCE(artist_info.final_email, 'None found') || E'\n' ||                               +
                             '*Source:* ' || email_source                                                                             +
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
                          'text', '*Invited By:*' || E'\n' || sent_by_email                                                           +
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
          -- Queue the notification with email status in title                                                                        +
          SELECT queue_slack_notification(                                                                                            +
              slack_channel,                                                                                                          +
              'artist_invitation',                                                                                                    +
              COALESCE(TRIM(artist_info.name), 'Artist') || ' invited to ' || COALESCE(TRIM(event_info.eid), 'Event') ||              +
              ' ' || email_status_emoji,                                                                                              +
              slack_blocks,                                                                                                           +
              event_info.id                                                                                                           +
          ) INTO notification_id;                                                                                                     +
                                                                                                                                      +
          RAISE NOTICE 'Complete invitation notification queued: % to channel: % | Email: % (%)',                                     +
                       notification_id, slack_channel,                                                                                +
                       COALESCE(artist_info.final_email, 'NONE'), email_source;                                                       +
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

