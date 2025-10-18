                                                            pg_get_functiondef                                                            
------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.notify_artist_confirmation_slack()                                                                    +
  RETURNS trigger                                                                                                                        +
  LANGUAGE plpgsql                                                                                                                       +
 AS $function$                                                                                                                           +
  DECLARE                                                                                                                                +
      artist_info RECORD;                                                                                                                +
      event_info RECORD;                                                                                                                 +
      slack_channel TEXT;                                                                                                                +
      slack_blocks JSONB;                                                                                                                +
      notification_id UUID;                                                                                                              +
      legal_name TEXT;                                                                                                                   +
      pronouns TEXT;                                                                                                                     +
      social_info TEXT;                                                                                                                  +
      confirmation_message TEXT;                                                                                                         +
      event_date_local TEXT;                                                                                                             +
      city_name TEXT;                                                                                                                    +
  BEGIN                                                                                                                                  +
      BEGIN                                                                                                                              +
          -- Get artist profile information                                                                                              +
          SELECT ap.name, ap.city, ap.country, ap.pronouns                                                                               +
          INTO artist_info                                                                                                               +
          FROM artist_profiles ap                                                                                                        +
          WHERE ap.id = NEW.artist_profile_id;                                                                                           +
                                                                                                                                         +
          -- Get event information INCLUDING city                                                                                        +
          SELECT e.name, e.eid, e.event_start_datetime, e.id, e.slack_channel, c.name as city_name                                       +
          INTO event_info                                                                                                                +
          FROM events e                                                                                                                  +
          LEFT JOIN cities c ON e.city_id = c.id                                                                                         +
          WHERE e.eid = NEW.event_eid;                                                                                                   +
                                                                                                                                         +
          -- Get city name                                                                                                               +
          city_name := COALESCE(event_info.city_name, 'Unknown City');                                                                   +
                                                                                                                                         +
          -- Format event date in LOCAL VENUE TIMEZONE                                                                                   +
          IF event_info.event_start_datetime IS NOT NULL THEN                                                                            +
              event_date_local := format_event_datetime_local(event_info.event_start_datetime, city_name);                               +
          ELSE                                                                                                                           +
              event_date_local := 'TBD';                                                                                                 +
          END IF;                                                                                                                        +
                                                                                                                                         +
          -- Determine Slack channel from event or fallback                                                                              +
          IF event_info.slack_channel IS NOT NULL AND LENGTH(TRIM(event_info.slack_channel)) > 0 THEN                                    +
              slack_channel := regexp_replace(TRIM(event_info.slack_channel), '^https://hooks\.slack\.com.*$', 'general');               +
              slack_channel := LTRIM(slack_channel, '#');                                                                                +
          ELSE                                                                                                                           +
              slack_channel := 'artist-notify';                                                                                          +
          END IF;                                                                                                                        +
                                                                                                                                         +
          -- Extract confirmation-specific data                                                                                          +
          legal_name := COALESCE(NEW.legal_name, 'Not provided');                                                                        +
                                                                                                                                         +
          -- Get pronouns from artist_profiles first, fallback to social_usernames, then metadata                                        +
          pronouns := COALESCE(                                                                                                          +
              NULLIF(TRIM(artist_info.pronouns), ''),                                                                                    +
              NULLIF(NEW.social_usernames->>'pronouns', ''),                                                                             +
              NULLIF(NEW.metadata->>'pronouns', ''),                                                                                     +
              'Not specified'                                                                                                            +
          );                                                                                                                             +
                                                                                                                                         +
          -- Get social media info from social_usernames                                                                                 +
          IF NEW.social_usernames IS NOT NULL AND NEW.social_usernames != '{}'::jsonb THEN                                               +
              social_info := COALESCE(                                                                                                   +
                  CONCAT_WS(' • ',                                                                                                       +
                      CASE WHEN NEW.social_usernames->>'instagram' IS NOT NULL                                                           +
                           THEN 'IG: @' || (NEW.social_usernames->>'instagram') END,                                                     +
                      CASE WHEN NEW.social_usernames->>'twitter' IS NOT NULL                                                             +
                           THEN 'X: @' || (NEW.social_usernames->>'twitter') END,                                                        +
                      CASE WHEN NEW.social_usernames->>'tiktok' IS NOT NULL                                                              +
                           THEN 'TT: @' || (NEW.social_usernames->>'tiktok') END                                                         +
                  ),                                                                                                                     +
                  'No social media provided'                                                                                             +
              );                                                                                                                         +
          ELSE                                                                                                                           +
              social_info := 'No social media provided';                                                                                 +
          END IF;                                                                                                                        +
                                                                                                                                         +
          confirmation_message := COALESCE(NEW.message_to_organizers, 'No message provided');                                            +
                                                                                                                                         +
          -- Build rich Slack blocks with artist name as title (matching invite style)                                                   +
          slack_blocks := jsonb_build_array(                                                                                             +
              -- Header block with artist name and event (same style as invites)                                                         +
              jsonb_build_object(                                                                                                        +
                  'type', 'header',                                                                                                      +
                  'text', jsonb_build_object(                                                                                            +
                      'type', 'plain_text',                                                                                              +
                      'text', COALESCE(TRIM(artist_info.name), 'Artist') || ' confirmed for ' || COALESCE(TRIM(event_info.eid), 'Event'),+
                      'emoji', true                                                                                                      +
                  )                                                                                                                      +
              ),                                                                                                                         +
              -- Artist confirmation details                                                                                             +
              jsonb_build_object(                                                                                                        +
                  'type', 'section',                                                                                                     +
                  'fields', jsonb_build_array(                                                                                           +
                      jsonb_build_object(                                                                                                +
                          'type', 'mrkdwn',                                                                                              +
                          'text', '*Legal Name:*' || E'\n' || legal_name                                                                 +
                      ),                                                                                                                 +
                      jsonb_build_object(                                                                                                +
                          'type', 'mrkdwn',                                                                                              +
                          'text', '*Pronouns:*' || E'\n' || pronouns                                                                     +
                      ),                                                                                                                 +
                      jsonb_build_object(                                                                                                +
                          'type', 'mrkdwn',                                                                                              +
                          'text', '*Location:*' || E'\n' ||                                                                              +
                                  COALESCE(TRIM(artist_info.city), 'Unknown') || ', ' ||                                                 +
                                  COALESCE(TRIM(artist_info.country), 'Unknown')                                                         +
                      ),                                                                                                                 +
                      jsonb_build_object(                                                                                                +
                          'type', 'mrkdwn',                                                                                              +
                          'text', '*Artist #:*' || E'\n' || COALESCE(NEW.artist_number::TEXT, 'N/A')                                     +
                      )                                                                                                                  +
                  )                                                                                                                      +
              )                                                                                                                          +
          );                                                                                                                             +
                                                                                                                                         +
          -- Add social media section if available                                                                                       +
          IF social_info != 'No social media provided' THEN                                                                              +
              slack_blocks := slack_blocks || jsonb_build_array(                                                                         +
                  jsonb_build_object(                                                                                                    +
                      'type', 'section',                                                                                                 +
                      'text', jsonb_build_object(                                                                                        +
                          'type', 'mrkdwn',                                                                                              +
                          'text', '*Social Media:*' || E'\n' || social_info                                                              +
                      )                                                                                                                  +
                  )                                                                                                                      +
              );                                                                                                                         +
          END IF;                                                                                                                        +
                                                                                                                                         +
          -- Add message to organizers if provided                                                                                       +
          IF confirmation_message != 'No message provided' THEN                                                                          +
              slack_blocks := slack_blocks || jsonb_build_array(                                                                         +
                  jsonb_build_object(                                                                                                    +
                      'type', 'section',                                                                                                 +
                      'text', jsonb_build_object(                                                                                        +
                          'type', 'mrkdwn',                                                                                              +
                          'text', '*Message to Organizers:*' || E'\n' ||                                                                 +
                                  LEFT(confirmation_message, 200) ||                                                                     +
                                  CASE WHEN LENGTH(confirmation_message) > 200 THEN '...' ELSE '' END                                    +
                      )                                                                                                                  +
                  )                                                                                                                      +
              );                                                                                                                         +
          END IF;                                                                                                                        +
                                                                                                                                         +
          -- Context with event details using LOCAL TIMEZONE DATE                                                                        +
          slack_blocks := slack_blocks || jsonb_build_array(                                                                             +
              jsonb_build_object(                                                                                                        +
                  'type', 'context',                                                                                                     +
                  'elements', jsonb_build_array(                                                                                         +
                      jsonb_build_object(                                                                                                +
                          'type', 'mrkdwn',                                                                                              +
                          'text', '*Event:* ' || COALESCE(event_info.name, 'Unknown Event') || ' • ' ||                                  +
                                  event_date_local ||                                                                                    +
                                  ' • *Confirmed:* ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI UTC')                                         +
                      )                                                                                                                  +
                  )                                                                                                                      +
              )                                                                                                                          +
          );                                                                                                                             +
                                                                                                                                         +
          -- Queue the notification                                                                                                      +
          SELECT queue_slack_notification(                                                                                               +
              slack_channel,                                                                                                             +
              'artist_confirmation',                                                                                                     +
              COALESCE(TRIM(artist_info.name), 'Artist') || ' confirmed for ' || COALESCE(TRIM(event_info.eid), 'Event'),                +
              slack_blocks,                                                                                                              +
              event_info.id                                                                                                              +
          ) INTO notification_id;                                                                                                        +
                                                                                                                                         +
          RAISE NOTICE 'Rich artist confirmation notification queued: % to channel: %', notification_id, slack_channel;                  +
                                                                                                                                         +
      EXCEPTION                                                                                                                          +
          WHEN OTHERS THEN                                                                                                               +
              RAISE NOTICE 'Slack notification error for confirmation %: % - %', NEW.id, SQLSTATE, SQLERRM;                              +
      END;                                                                                                                               +
                                                                                                                                         +
      RETURN NEW;                                                                                                                        +
  END;                                                                                                                                   +
  $function$                                                                                                                             +
 
(1 row)

