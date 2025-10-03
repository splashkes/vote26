                                                 pg_get_functiondef                                                 
--------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.notify_manual_payment_request_slack()                                           +
  RETURNS trigger                                                                                                  +
  LANGUAGE plpgsql                                                                                                 +
 AS $function$                                                                                                     +
 DECLARE                                                                                                           +
     artist_info RECORD;                                                                                           +
     person_info RECORD;                                                                                           +
     event_names TEXT;                                                                                             +
     slack_channel TEXT := 'payments'; -- Default channel for payment notifications                                +
     notification_text TEXT;                                                                                       +
     slack_blocks JSONB;                                                                                           +
     result_id UUID;                                                                                               +
 BEGIN                                                                                                             +
     BEGIN                                                                                                         +
         -- Validate required data exists                                                                          +
         IF NEW.artist_profile_id IS NULL OR NEW.person_id IS NULL THEN                                            +
             RAISE NOTICE 'Slack notification skipped: missing required data for manual payment request %', NEW.id;+
             RETURN NEW;                                                                                           +
         END IF;                                                                                                   +
                                                                                                                   +
         -- Get artist profile information                                                                         +
         SELECT ap.name, ap.id                                                                                     +
         INTO artist_info                                                                                          +
         FROM artist_profiles ap                                                                                   +
         WHERE ap.id = NEW.artist_profile_id;                                                                      +
                                                                                                                   +
         IF NOT FOUND THEN                                                                                         +
             RAISE NOTICE 'Slack notification skipped: Artist profile % not found', NEW.artist_profile_id;         +
             RETURN NEW;                                                                                           +
         END IF;                                                                                                   +
                                                                                                                   +
         -- Get person information (contact details)                                                               +
         SELECT p.name, p.phone, p.email                                                                           +
         INTO person_info                                                                                          +
         FROM people p                                                                                             +
         WHERE p.id = NEW.person_id;                                                                               +
                                                                                                                   +
         -- Get event names from events_referenced array                                                           +
         IF NEW.events_referenced IS NOT NULL AND array_length(NEW.events_referenced, 1) > 0 THEN                  +
             SELECT string_agg(e.name, ', ')                                                                       +
             INTO event_names                                                                                      +
             FROM events e                                                                                         +
             WHERE e.eid = ANY(NEW.events_referenced);                                                             +
         ELSE                                                                                                      +
             event_names := 'No events specified';                                                                 +
         END IF;                                                                                                   +
                                                                                                                   +
         -- Build notification text                                                                                +
         notification_text := format(                                                                              +
             '💰 *Manual Payment Request Submitted*\n\n' ||                                                         +
             '*Artist:* %s\n' ||                                                                                   +
             '*Amount:* $%s %s\n' ||                                                                               +
             '*Phone:* %s\n' ||                                                                                    +
             '*Email:* %s\n' ||                                                                                    +
             '*Events:* %s\n' ||                                                                                   +
             '*Status:* %s\n\n' ||                                                                                 +
             '_Submitted: %s_',                                                                                    +
             artist_info.name,                                                                                     +
             COALESCE(NEW.requested_amount::text, 'N/A'),                                                          +
             COALESCE(NEW.preferred_currency, 'USD'),                                                              +
             COALESCE(person_info.phone, 'N/A'),                                                                   +
             COALESCE(person_info.email, 'N/A'),                                                                   +
             COALESCE(event_names, 'N/A'),                                                                         +
             COALESCE(NEW.status, 'pending'),                                                                      +
             to_char(NEW.created_at, 'YYYY-MM-DD HH24:MI')                                                         +
         );                                                                                                        +
                                                                                                                   +
         -- Build Slack blocks for rich formatting                                                                 +
         slack_blocks := jsonb_build_array(                                                                        +
             jsonb_build_object(                                                                                   +
                 'type', 'header',                                                                                 +
                 'text', jsonb_build_object(                                                                       +
                     'type', 'plain_text',                                                                         +
                     'text', '💰 Manual Payment Request',                                                           +
                     'emoji', true                                                                                 +
                 )                                                                                                 +
             ),                                                                                                    +
             jsonb_build_object(                                                                                   +
                 'type', 'section',                                                                                +
                 'fields', jsonb_build_array(                                                                      +
                     jsonb_build_object(                                                                           +
                         'type', 'mrkdwn',                                                                         +
                         'text', format('*Artist:*\n%s', artist_info.name)                                         +
                     ),                                                                                            +
                     jsonb_build_object(                                                                           +
                         'type', 'mrkdwn',                                                                         +
                         'text', format('*Amount:*\n$%s %s',                                                       +
                             COALESCE(NEW.requested_amount::text, 'N/A'),                                          +
                             COALESCE(NEW.preferred_currency, 'USD')                                               +
                         )                                                                                         +
                     ),                                                                                            +
                     jsonb_build_object(                                                                           +
                         'type', 'mrkdwn',                                                                         +
                         'text', format('*Phone:*\n%s', COALESCE(person_info.phone, 'N/A'))                        +
                     ),                                                                                            +
                     jsonb_build_object(                                                                           +
                         'type', 'mrkdwn',                                                                         +
                         'text', format('*Email:*\n%s', COALESCE(person_info.email, 'N/A'))                        +
                     )                                                                                             +
                 )                                                                                                 +
             ),                                                                                                    +
             jsonb_build_object(                                                                                   +
                 'type', 'section',                                                                                +
                 'fields', jsonb_build_array(                                                                      +
                     jsonb_build_object(                                                                           +
                         'type', 'mrkdwn',                                                                         +
                         'text', format('*Events:*\n%s', COALESCE(event_names, 'N/A'))                             +
                     ),                                                                                            +
                     jsonb_build_object(                                                                           +
                         'type', 'mrkdwn',                                                                         +
                         'text', format('*Status:*\n%s', COALESCE(NEW.status, 'pending'))                          +
                     )                                                                                             +
                 )                                                                                                 +
             ),                                                                                                    +
             jsonb_build_object(                                                                                   +
                 'type', 'section',                                                                                +
                 'text', jsonb_build_object(                                                                       +
                     'type', 'mrkdwn',                                                                             +
                     'text', format('*Payment Details:*\n```%s```',                                                +
                         COALESCE(substring(NEW.payment_details from 1 for 500), 'No details provided')            +
                     )                                                                                             +
                 )                                                                                                 +
             ),                                                                                                    +
             jsonb_build_object(                                                                                   +
                 'type', 'context',                                                                                +
                 'elements', jsonb_build_array(                                                                    +
                     jsonb_build_object(                                                                           +
                         'type', 'mrkdwn',                                                                         +
                         'text', format('Submitted: %s | Request ID: %s',                                          +
                             to_char(NEW.created_at, 'YYYY-MM-DD HH24:MI'),                                        +
                             substring(NEW.id::text from 1 for 8)                                                  +
                         )                                                                                         +
                     )                                                                                             +
                 )                                                                                                 +
             )                                                                                                     +
         );                                                                                                        +
                                                                                                                   +
         -- Queue the Slack notification                                                                           +
         SELECT queue_slack_notification(                                                                          +
             slack_channel,                                                                                        +
             'manual_payment_request',                                                                             +
             notification_text,                                                                                    +
             slack_blocks,                                                                                         +
             NULL -- no specific event_id                                                                          +
         ) INTO result_id;                                                                                         +
                                                                                                                   +
         RAISE NOTICE 'Manual payment request Slack notification queued: % for artist %',                          +
             result_id, artist_info.name;                                                                          +
                                                                                                                   +
     EXCEPTION WHEN OTHERS THEN                                                                                    +
         RAISE WARNING 'Error sending manual payment request Slack notification: %', SQLERRM;                      +
         -- Don't fail the insert if Slack notification fails                                                      +
     END;                                                                                                          +
                                                                                                                   +
     RETURN NEW;                                                                                                   +
 END;                                                                                                              +
 $function$                                                                                                        +
 
(1 row)

