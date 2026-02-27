-- Retrigger invitation emails for recently backfilled invitations
-- Date: 2025-11-16
-- Purpose: Send emails for invitations that now have artist_profile_id populated

-- Create temporary function to retrigger emails
CREATE OR REPLACE FUNCTION retrigger_invitation_emails()
RETURNS TABLE(invitation_id uuid, artist_number text, event_eid text, email_sent boolean, message text) AS $$
DECLARE
    invitation_record RECORD;
BEGIN
    -- Loop through invitations that were just backfilled (updated in last hour)
    FOR invitation_record IN
        SELECT ai.id, ai.artist_number, ai.event_eid, ai.artist_profile_id, ai.message_from_producer
        FROM artist_invitations ai
        WHERE ai.artist_profile_id IS NOT NULL
          AND ai.created_at >= NOW() - INTERVAL '7 days'
          AND ai.updated_at >= NOW() - INTERVAL '1 hour'
        ORDER BY ai.created_at DESC
    LOOP
        BEGIN
            -- Simulate the trigger by calling send_artist_invitation_email logic
            -- This will re-execute the email sending for this invitation
            PERFORM send_artist_invitation_email_manual(invitation_record.id);

            -- Return success
            RETURN QUERY SELECT
                invitation_record.id,
                invitation_record.artist_number,
                invitation_record.event_eid,
                true,
                'Email retriggered successfully'::text;

        EXCEPTION WHEN OTHERS THEN
            -- Return failure with error message
            RETURN QUERY SELECT
                invitation_record.id,
                invitation_record.artist_number,
                invitation_record.event_eid,
                false,
                SQLERRM::text;
        END;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create helper function to manually send invitation email
CREATE OR REPLACE FUNCTION send_artist_invitation_email_manual(invitation_id uuid)
RETURNS void AS $$
DECLARE
    invitation_data RECORD;
    artist_info RECORD;
    event_info RECORD;
    email_response http_response;
    email_subject TEXT;
    email_html TEXT;
    email_text TEXT;
    event_date TEXT;
    service_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzQyMTY5NiwiZXhwIjoyMDY4OTk3Njk2fQ.wQieprnqKOD1Ez-OJVzl9MbjvxmqNtW0FDzrkSPcDrg';
BEGIN
    -- Get invitation data
    SELECT * INTO invitation_data
    FROM artist_invitations
    WHERE id = invitation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation not found: %', invitation_id;
    END IF;

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
    WHERE ap.id = invitation_data.artist_profile_id;

    -- Get event information
    SELECT e.name, e.eid, e.event_start_datetime, e.venue, c.name as city_name
    INTO event_info
    FROM events e
    LEFT JOIN cities c ON e.city_id = c.id
    WHERE e.eid = invitation_data.event_eid;

    RAISE NOTICE 'Sending email to: % for event: %', artist_info.email, event_info.eid;

    -- Only send email if we have artist email and event info
    IF artist_info.email IS NOT NULL AND event_info IS NOT NULL THEN
        -- Format event date in local timezone
        IF event_info.event_start_datetime IS NOT NULL THEN
            event_date := format_event_datetime_local(event_info.event_start_datetime, event_info.city_name);
        ELSE
            event_date := 'TBD';
        END IF;

        -- Build email subject
        email_subject := 'You''re Invited! ' || event_info.eid || ' ' || COALESCE(event_info.city_name, 'Unknown');

        -- Build email HTML
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

        -- Build email text
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
            RAISE NOTICE 'SUCCESS: Email sent to: %', artist_info.email;
        ELSE
            RAISE WARNING 'FAILED: Email send failed (status %): %', email_response.status, email_response.content;
        END IF;
    ELSE
        RAISE WARNING 'SKIPPED: No email or event info for invitation %', invitation_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Execute the retrigger
SELECT * FROM retrigger_invitation_emails();

-- Clean up temporary functions
DROP FUNCTION IF EXISTS retrigger_invitation_emails();
DROP FUNCTION IF EXISTS send_artist_invitation_email_manual(uuid);
