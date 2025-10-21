                                                 pg_get_functiondef                                                 
--------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.notify_manual_payment_request_slack()                                           +
  RETURNS trigger                                                                                                  +
  LANGUAGE plpgsql                                                                                                 +
 AS $function$                                                                                                     +
 DECLARE                                                                                                           +
     artist_info RECORD;                                                                                           +
     person_info RECORD;                                                                                           +
     event_list TEXT;                                                                                              +
     slack_channel TEXT := 'payments-artists'; -- Correct channel name                                             +
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
         SELECT ap.name, ap.id, ap.entry_id                                                                        +
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
         SELECT p.name, p.phone_number, p.email                                                                    +
         INTO person_info                                                                                          +
         FROM people p                                                                                             +
         WHERE p.id = NEW.person_id;                                                                               +
                                                                                                                   +
         -- Get formatted event list with EID and city                                                             +
         IF NEW.events_referenced IS NOT NULL AND array_length(NEW.events_referenced, 1) > 0 THEN                  +
             SELECT string_agg(                                                                                    +
                 format('%s – %s', e.eid, COALESCE(c.name, 'Unknown')),                                            +
                 ', '                                                                                              +
                 ORDER BY e.event_start_datetime DESC                                                              +
             )                                                                                                     +
             INTO event_list                                                                                       +
             FROM events e                                                                                         +
             LEFT JOIN cities c ON e.city_id = c.id                                                                +
             WHERE e.eid = ANY(NEW.events_referenced);                                                             +
         ELSE                                                                                                      +
             event_list := 'No events specified';                                                                  +
         END IF;                                                                                                   +
                                                                                                                   +
         -- Build notification text (fallback for notifications that don't support blocks)                         +
         notification_text := format(                                                                              +
             '💰 Manual Payment Request from %s - $%s %s',                                                          +
             artist_info.name,                                                                                     +
             COALESCE(NEW.requested_amount::text, 'N/A'),                                                          +
             COALESCE(NEW.preferred_currency, 'USD')                                                               +
         );                                                                                                        +
                                                                                                                   +
         -- Build improved Slack blocks for rich formatting                                                        +
         slack_blocks := jsonb_build_array(                                                                        +
             -- Header                                                                                             +
             jsonb_build_object(                                                                                   +
                 'type', 'header',                                                                                 +
                 'text', jsonb_build_object(                                                                       +
                     'type', 'plain_text',                                                                         +
                     'text', '💰 Manual Payment Request',                                                           +
                     'emoji', true                                                                                 +
                 )                                                                                                 +
             ),                                                                                                    +
             -- Artist and Amount section                                                                          +
             jsonb_build_object(                                                                                   +
                 'type', 'section',                                                                                +
                 'fields', jsonb_build_array(                                                                      +
                     jsonb_build_object(                                                                           +
                         'type', 'mrkdwn',                                                                         +
                         'text', format('*Artist:*%s%s%s',                                                         +
                             E'\n',                                                                                +
                             artist_info.name,                                                                     +
                             CASE WHEN artist_info.entry_id IS NOT NULL                                            +
                                 THEN format(' (Artist #%s)', artist_info.entry_id)                                +
                                 ELSE ''                                                                           +
                             END                                                                                   +
                         )                                                                                         +
                     ),                                                                                            +
                     jsonb_build_object(                                                                           +
                         'type', 'mrkdwn',                                                                         +
                         'text', format('*Amount:*%s$%s %s',                                                       +
                             E'\n',                                                                                +
                             COALESCE(NEW.requested_amount::text, 'N/A'),                                          +
                             COALESCE(NEW.preferred_currency, 'USD')                                               +
                         )                                                                                         +
                     )                                                                                             +
                 )                                                                                                 +
             ),                                                                                                    +
             -- Contact Information section                                                                        +
             jsonb_build_object(                                                                                   +
                 'type', 'section',                                                                                +
                 'fields', jsonb_build_array(                                                                      +
                     jsonb_build_object(                                                                           +
                         'type', 'mrkdwn',                                                                         +
                         'text', format('*Email:*%s%s',                                                            +
                             E'\n',                                                                                +
                             COALESCE(person_info.email, 'N/A')                                                    +
                         )                                                                                         +
                     ),                                                                                            +
                     jsonb_build_object(                                                                           +
                         'type', 'mrkdwn',                                                                         +
                         'text', format('*Phone:*%s%s',                                                            +
                             E'\n',                                                                                +
                             COALESCE(person_info.phone_number, 'N/A')                                             +
                         )                                                                                         +
                     )                                                                                             +
                 )                                                                                                 +
             ),                                                                                                    +
             -- Events and Status section                                                                          +
             jsonb_build_object(                                                                                   +
                 'type', 'section',                                                                                +
                 'fields', jsonb_build_array(                                                                      +
                     jsonb_build_object(                                                                           +
                         'type', 'mrkdwn',                                                                         +
                         'text', format('*Events:*%s%s',                                                           +
                             E'\n',                                                                                +
                             COALESCE(event_list, 'N/A')                                                           +
                         )                                                                                         +
                     ),                                                                                            +
                     jsonb_build_object(                                                                           +
                         'type', 'mrkdwn',                                                                         +
                         'text', format('*Status:*%s%s',                                                           +
                             E'\n',                                                                                +
                             CASE COALESCE(NEW.status, 'pending')                                                  +
                                 WHEN 'pending' THEN '🟡 Pending'                                                   +
                                 WHEN 'approved' THEN '✅ Approved'                                                 +
                                 WHEN 'paid' THEN '💰 Paid'                                                         +
                                 WHEN 'rejected' THEN '❌ Rejected'                                                 +
                                 ELSE COALESCE(NEW.status, 'pending')                                              +
                             END                                                                                   +
                         )                                                                                         +
                     )                                                                                             +
                 )                                                                                                 +
             ),                                                                                                    +
             -- Payment Details section (full width)                                                               +
             jsonb_build_object(                                                                                   +
                 'type', 'section',                                                                                +
                 'text', jsonb_build_object(                                                                       +
                     'type', 'mrkdwn',                                                                             +
                     'text', format('*Payment Details:*%s```%s```',                                                +
                         E'\n',                                                                                    +
                         COALESCE(substring(NEW.payment_details from 1 for 500), 'No details provided')            +
                     )                                                                                             +
                 )                                                                                                 +
             ),                                                                                                    +
             -- Divider                                                                                            +
             jsonb_build_object(                                                                                   +
                 'type', 'divider'                                                                                 +
             ),                                                                                                    +
             -- Context/Footer                                                                                     +
             jsonb_build_object(                                                                                   +
                 'type', 'context',                                                                                +
                 'elements', jsonb_build_array(                                                                    +
                     jsonb_build_object(                                                                           +
                         'type', 'mrkdwn',                                                                         +
                         'text', format('Submitted: %s | Request ID: `%s`',                                        +
                             to_char(NEW.created_at, 'YYYY-MM-DD HH24:MI'),                                        +
                             substring(NEW.id::text from 1 for 8)                                                  +
                         )                                                                                         +
                     )                                                                                             +
                 )                                                                                                 +
             )                                                                                                     +
         );                                                                                                        +
                                                                                                                   +
         -- Queue the Slack notification to artist-payments channel                                                +
         SELECT queue_slack_notification(                                                                          +
             slack_channel,                                                                                        +
             'manual_payment_request',                                                                             +
             notification_text,                                                                                    +
             slack_blocks,                                                                                         +
             NULL -- no specific event_id                                                                          +
         ) INTO result_id;                                                                                         +
                                                                                                                   +
         RAISE NOTICE 'Manual payment request Slack notification queued: % for artist % to #%',                    +
             result_id, artist_info.name, slack_channel;                                                           +
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

