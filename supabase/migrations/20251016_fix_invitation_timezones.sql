-- Fix timezone issues in invitation Slack notification and email
-- Date: 2025-10-16
-- Issue: Invitation Slack notifications and emails were showing event dates in UTC instead of local venue timezone

-- Update notify_artist_invitation_slack to use timezone-aware formatting
CREATE OR REPLACE FUNCTION public.notify_artist_invitation_slack()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
 DECLARE
     artist_info RECORD;
     event_info RECORD;
     sent_by_email TEXT;
     slack_channel TEXT;
     slack_blocks JSONB;
     notification_id UUID;
     invitation_message TEXT;
     formatted_message TEXT;
     email_status_text TEXT;
     email_status_emoji TEXT;
     email_source TEXT;
     event_date_local TEXT;
     city_name TEXT;
 BEGIN
     BEGIN
         -- Get artist profile information including email from ALL possible sources
         SELECT ap.name, ap.city, ap.country, ap.bio,
                ap.email as profile_email,
                p.email as people_email,
                au.email as auth_email,
                COALESCE(ap.email, p.email, au.email) as final_email
         INTO artist_info
         FROM artist_profiles ap
         LEFT JOIN people p ON ap.person_id = p.id
         LEFT JOIN auth.users au ON p.auth_user_id = au.id
         WHERE ap.id = NEW.artist_profile_id;

         -- Get event information using event_eid INCLUDING city
         SELECT e.name, e.eid, e.event_start_datetime, e.id, e.slack_channel, c.name as city_name
         INTO event_info
         FROM events e
         LEFT JOIN cities c ON e.city_id = c.id
         WHERE e.eid = NEW.event_eid;

         -- Get city name
         city_name := COALESCE(event_info.city_name, 'Unknown City');

         -- Format event date in LOCAL VENUE TIMEZONE
         IF event_info.event_start_datetime IS NOT NULL THEN
             event_date_local := format_event_datetime_local(event_info.event_start_datetime, city_name);
         ELSE
             event_date_local := 'TBD';
         END IF;

         -- Get admin who sent the invitation from metadata
         sent_by_email := COALESCE(NEW.metadata->>'sent_by', 'System');

         -- Determine email status and source with detailed information
         IF artist_info.final_email IS NULL THEN
             email_status_text := 'No Email Found';
             email_status_emoji := '❌';
             email_source := 'Checked: profile, people, auth - all NULL';
         ELSIF event_info IS NULL THEN
             email_status_text := 'No Event Info';
             email_status_emoji := '❌';
             email_source := 'Email available but missing event';
         ELSE
             -- Determine which email source was used
             IF artist_info.profile_email IS NOT NULL THEN
                 email_source := 'from artist_profiles.email';
             ELSIF artist_info.people_email IS NOT NULL THEN
                 email_source := 'from people.email';
             ELSIF artist_info.auth_email IS NOT NULL THEN
                 email_source := 'from auth.users.email';
             ELSE
                 email_source := 'unknown source';
             END IF;

             email_status_text := 'Email Sent';
             email_status_emoji := '📤';
         END IF;

         -- Determine Slack channel from event or fallback
         IF event_info.slack_channel IS NOT NULL AND LENGTH(TRIM(event_info.slack_channel)) > 0 THEN
             slack_channel := regexp_replace(TRIM(event_info.slack_channel), '^https://hooks\.slack\.com.*$', 'general');
             slack_channel := LTRIM(slack_channel, '#');
         ELSE
             slack_channel := 'artist-notify';
         END IF;

         -- Get and format invitation message
         invitation_message := COALESCE(NEW.message_from_producer, 'Standard invitation sent');
         formatted_message := regexp_replace(invitation_message, '\\n', E'\n', 'g');
         formatted_message := replace(formatted_message, '\\!', '\!');
         formatted_message := replace(formatted_message, '\?', '?');

         -- Truncate if too long
         IF LENGTH(formatted_message) > 300 THEN
             formatted_message := LEFT(formatted_message, 300) || '...';
         END IF;

         -- Build rich Slack blocks with comprehensive email status
         slack_blocks := jsonb_build_array(
             -- Header block with artist name and event
             jsonb_build_object(
                 'type', 'header',
                 'text', jsonb_build_object(
                     'type', 'plain_text',
                     'text', COALESCE(TRIM(artist_info.name), 'Artist') || ' invited to ' || COALESCE(TRIM(event_info.eid), 'Event'),
                     'emoji', true
                 )
             ),
             -- Email status alert section with detailed information
             jsonb_build_object(
                 'type', 'section',
                 'text', jsonb_build_object(
                     'type', 'mrkdwn',
                     'text', email_status_emoji || ' *Email Status:* ' || email_status_text || E'\n' ||
                            '*Email:* ' || COALESCE(artist_info.final_email, 'None found') || E'\n' ||
                            '*Source:* ' || email_source
                 )
             ),
             -- Main section with producer message
             jsonb_build_object(
                 'type', 'section',
                 'text', jsonb_build_object(
                     'type', 'mrkdwn',
                     'text', '*Producer Message:*' || E'\n' || formatted_message
                 )
             ),
             -- Artist details section
             jsonb_build_object(
                 'type', 'section',
                 'fields', jsonb_build_array(
                     jsonb_build_object(
                         'type', 'mrkdwn',
                         'text', '*Location:*' || E'\n' ||
                                 COALESCE(TRIM(artist_info.city), 'Unknown') || ', ' ||
                                 COALESCE(TRIM(artist_info.country), 'Unknown')
                     ),
                     jsonb_build_object(
                         'type', 'mrkdwn',
                         'text', '*Invited By:*' || E'\n' || sent_by_email
                     )
                 )
             ),
             -- Context with event details using LOCAL TIMEZONE DATE
             jsonb_build_object(
                 'type', 'context',
                 'elements', jsonb_build_array(
                     jsonb_build_object(
                         'type', 'mrkdwn',
                         'text', '*Event:* ' || COALESCE(event_info.name, 'Unknown Event') || ' • ' ||
                                 event_date_local ||
                                 ' • *Invited:* ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI UTC')
                     )
                 )
             )
         );

         -- Queue the notification with email status in title
         SELECT queue_slack_notification(
             slack_channel,
             'artist_invitation',
             COALESCE(TRIM(artist_info.name), 'Artist') || ' invited to ' || COALESCE(TRIM(event_info.eid), 'Event') ||
             ' ' || email_status_emoji,
             slack_blocks,
             event_info.id
         ) INTO notification_id;

         RAISE NOTICE 'Complete invitation notification queued: % to channel: % | Email: % (%)',
                      notification_id, slack_channel,
                      COALESCE(artist_info.final_email, 'NONE'), email_source;

     EXCEPTION
         WHEN OTHERS THEN
             RAISE NOTICE 'Slack notification error for invitation %: % - %', NEW.id, SQLSTATE, SQLERRM;
     END;

     RETURN NEW;
 END;
 $function$;

-- Update send_artist_invitation_email to use timezone-aware formatting
CREATE OR REPLACE FUNCTION public.send_artist_invitation_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
AS $function$
 DECLARE
     artist_info RECORD;
     event_info RECORD;
     email_response http_response;
     email_subject TEXT;
     email_html TEXT;
     email_text TEXT;
     event_date TEXT;
     city_name TEXT;
     service_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzQyMTY5NiwiZXhwIjoyMDY4OTk3Njk2fQ.wQieprnqKOD1Ez-OJVzl9MbjvxmqNtW0FDzrkSPcDrg';
 BEGIN
     BEGIN
         -- Get artist profile information including email from ALL possible sources
         SELECT ap.name,
                COALESCE(ap.email, p.email, au.email) as email,
                ap.email as profile_email,
                p.email as people_email,
                au.email as auth_email
         INTO artist_info
         FROM artist_profiles ap
         LEFT JOIN people p ON ap.person_id = p.id
         LEFT JOIN auth.users au ON p.auth_user_id = au.id
         WHERE ap.id = NEW.artist_profile_id;

         -- Get event information INCLUDING city for timezone conversion
         SELECT e.name, e.eid, e.event_start_datetime, e.venue, c.name as city_name
         INTO event_info
         FROM events e
         LEFT JOIN cities c ON e.city_id = c.id
         WHERE e.eid = NEW.event_eid;

         -- Enhanced logging to show which email source was used
         RAISE NOTICE 'Email check for artist %. Profile: %, People: %, Auth: %, Final: %',
                      artist_info.name,
                      COALESCE(artist_info.profile_email, 'NULL'),
                      COALESCE(artist_info.people_email, 'NULL'),
                      COALESCE(artist_info.auth_email, 'NULL'),
                      COALESCE(artist_info.email, 'NULL');

         -- Only send email if we have artist email and event info
         IF artist_info.email IS NOT NULL AND event_info IS NOT NULL THEN
             RAISE NOTICE 'Sending invitation email to: % for event: %', artist_info.email, event_info.eid;

             -- Get city name for timezone conversion
             city_name := COALESCE(event_info.city_name, 'Unknown City');

             -- Format event date in LOCAL VENUE TIMEZONE using our helper function
             IF event_info.event_start_datetime IS NOT NULL THEN
                 -- Use format_event_datetime_local for consistent formatting
                 event_date := format_event_datetime_local(event_info.event_start_datetime, city_name);
             ELSE
                 event_date := 'TBD';
             END IF;

             -- Build email subject
             email_subject := 'You''re Invited\! ' || event_info.eid || ' ' || city_name;

             -- Build simple email HTML content (keeping existing template)
             email_html := '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
 <div style="background: #e74c3c; color: white; padding: 20px; text-align: center;">
 <h1>Art Battle</h1>
 </div>
 <div style="padding: 30px 20px;">
 <h2 style="color: #e74c3c;">You are Invited to Paint\!</h2>
 <p>Hello <strong>' || COALESCE(artist_info.name, 'Artist') || '</strong>,</p>
 <p>You have been invited to participate in <strong>' || COALESCE(event_info.name, event_info.eid) || '</strong>\!</p>
 <div style="background: #f8f9fa; padding: 20px; margin: 20px 0;">
 <h3>Event Details:</h3>
 <p><strong>Event:</strong> ' || event_info.eid || '</p>
 <p><strong>Date:</strong> ' || event_date || '</p>
 <p><strong>Location:</strong> ' || COALESCE(event_info.venue, 'TBD') || '</p>
 <p><strong>City:</strong> ' || city_name || '</p>
 </div>
 <div style="background: #d4edda; padding: 20px; margin: 20px 0;">
 <h3>Action Required:</h3>
 <p>Please log in to your artist dashboard to accept or decline this invitation.</p>
 </div>
 <div style="text-align: center; margin: 30px 0;">
 <a href="https://artb.art/profile" style="background: #28a745; color: white; padding: 16px 32px; text-decoration: none; border-radius: 6px; font-weight: bold;">Accept Invitation</a>
 </div>
 <p>Questions? Contact us at hello@artbattle.com</p>
 </div>
 </div>';

             -- Build email text content
             email_text := 'Art Battle - You are Invited to Paint\!

 Hello ' || COALESCE(artist_info.name, 'Artist') || ',

 You have been invited to participate in ' || COALESCE(event_info.name, event_info.eid) || '\!

 Event Details:
 - Event: ' || event_info.eid || '
 - Date: ' || event_date || '
 - Location: ' || COALESCE(event_info.venue, 'TBD') || '
 - City: ' || city_name || '

 ACTION REQUIRED:
 Please log in to your artist dashboard to accept or decline this invitation.

 Accept your invitation: https://artb.art/profile

 Questions? Contact us at hello@artbattle.com';

             -- Call the send-custom-email function via HTTP
             BEGIN
                 SELECT * INTO email_response
                 FROM http((
                     'POST',
                     'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/send-custom-email',
                     ARRAY[
                         http_header('Authorization', 'Bearer ' || service_key),
                         http_header('Content-Type', 'application/json')
                     ],
                     'application/json',
                     json_build_object(
                         'to', artist_info.email,
                         'subject', email_subject,
                         'html', email_html,
                         'text', email_text,
                         'from', 'hello@artbattle.com'
                     )::TEXT
                 ));

                 IF email_response.status = 200 THEN
                     RAISE NOTICE 'SUCCESS: Invitation email sent to: %', artist_info.email;
                 ELSE
                     RAISE NOTICE 'FAILED: Email send failed (status %): %', email_response.status, email_response.content;
                 END IF;

             EXCEPTION
                 WHEN OTHERS THEN
                     RAISE NOTICE 'FAILED: Email send exception: % - %', SQLSTATE, SQLERRM;
             END;

         ELSE
             IF artist_info.email IS NULL THEN
                 RAISE NOTICE 'SKIPPED: No email found in any location for artist_profile_id: %', NEW.artist_profile_id;
             END IF;
             IF event_info IS NULL THEN
                 RAISE NOTICE 'SKIPPED: No event info found for event_eid: %', NEW.event_eid;
             END IF;
         END IF;

     EXCEPTION
         WHEN OTHERS THEN
             RAISE NOTICE 'Email function error for invitation %: % - %', NEW.id, SQLSTATE, SQLERRM;
     END;

     RETURN NEW;
 END;
 $function$;

-- Add comments
COMMENT ON FUNCTION notify_artist_invitation_slack IS 'Sends Slack notification when artist is invited - date shown in local venue timezone';
COMMENT ON FUNCTION send_artist_invitation_email IS 'Sends invitation email when artist is invited - date shown in local venue timezone';
