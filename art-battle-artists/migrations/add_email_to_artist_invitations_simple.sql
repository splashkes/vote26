-- Add email notifications to artist invitations (simplified approach)

-- First, enable the http extension if not already enabled
CREATE EXTENSION IF NOT EXISTS http;

CREATE OR REPLACE FUNCTION public.send_artist_invitation_email()
RETURNS TRIGGER AS $$
DECLARE
    artist_info RECORD;
    event_info RECORD;
    email_response http_response;
    email_subject TEXT;
    email_html TEXT;
    email_text TEXT;
    event_date TEXT;
    service_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzQyMTY5NiwiZXhwIjoyMDY4OTk3Njk2fQ.wQieprnqKOD1Ez-OJVzl9MbjvxmqNtW0FDzrkSPcDrg';
BEGIN
    BEGIN
        -- Get artist profile information including email
        SELECT ap.name, p.email
        INTO artist_info
        FROM artist_profiles ap
        JOIN people p ON ap.person_id = p.id
        WHERE ap.id = NEW.artist_profile_id;

        -- Get event information
        SELECT e.name, e.eid, e.event_start_datetime, e.venue, c.name as city_name
        INTO event_info
        FROM events e
        LEFT JOIN cities c ON e.city_id = c.id
        WHERE e.eid = NEW.event_eid;

        -- Only send email if we have artist email and event info
        IF artist_info.email IS NOT NULL AND event_info IS NOT NULL THEN
            RAISE NOTICE 'Sending invitation email to: % for event: %', artist_info.email, event_info.eid;

            -- Format event date
            IF event_info.event_start_datetime IS NOT NULL THEN
                event_date := TO_CHAR(event_info.event_start_datetime, 'Day, Month DD, YYYY');
            ELSE
                event_date := 'TBD';
            END IF;

            -- Build email subject
            email_subject := 'You''re Invited! ' || event_info.eid || ' ' || COALESCE(event_info.city_name, 'Unknown');

            -- Build simple email HTML content (avoiding complex escaping)
            email_html := '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
<div style="background: #e74c3c; color: white; padding: 20px; text-align: center;">
<h1>Art Battle</h1>
</div>
<div style="padding: 30px 20px;">
<h2 style="color: #e74c3c;">You are Invited to Paint!</h2>
<p>Hello <strong>' || COALESCE(artist_info.name, 'Artist') || '</strong>,</p>
<p>You have been invited to participate in <strong>' || COALESCE(event_info.name, event_info.eid) || '</strong>!</p>
<div style="background: #f8f9fa; padding: 20px; margin: 20px 0;">
<h3>Event Details:</h3>
<p><strong>Event:</strong> ' || event_info.eid || '</p>
<p><strong>Date:</strong> ' || event_date || '</p>
<p><strong>Location:</strong> ' || COALESCE(event_info.venue, 'TBD') || '</p>
<p><strong>City:</strong> ' || COALESCE(event_info.city_name, 'Unknown') || '</p>
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
            email_text := 'Art Battle - You are Invited to Paint!

Hello ' || COALESCE(artist_info.name, 'Artist') || ',

You have been invited to participate in ' || COALESCE(event_info.name, event_info.eid) || '!

Event Details:
- Event: ' || event_info.eid || '
- Date: ' || event_date || '
- Location: ' || COALESCE(event_info.venue, 'TBD') || '
- City: ' || COALESCE(event_info.city_name, 'Unknown') || '

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
                    RAISE NOTICE 'Invitation email sent successfully to: %', artist_info.email;
                ELSE
                    RAISE NOTICE 'Failed to send invitation email (status %): %', email_response.status, email_response.content;
                END IF;

            EXCEPTION
                WHEN OTHERS THEN
                    RAISE NOTICE 'Error sending invitation email to %: % - %', artist_info.email, SQLSTATE, SQLERRM;
            END;
        ELSE
            RAISE NOTICE 'Skipping invitation email - no email or event info found for artist_profile_id: %', NEW.artist_profile_id;
        END IF;

    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Invitation email function error for invitation %: % - %', NEW.id, SQLSTATE, SQLERRM;
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for artist invitation emails (after existing slack trigger)
DROP TRIGGER IF EXISTS artist_invitation_email_notification ON artist_invitations;
CREATE TRIGGER artist_invitation_email_notification
    AFTER INSERT ON artist_invitations
    FOR EACH ROW
    EXECUTE FUNCTION send_artist_invitation_email();