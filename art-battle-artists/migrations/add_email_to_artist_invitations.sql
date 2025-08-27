-- Add email notifications to artist invitations trigger

CREATE OR REPLACE FUNCTION public.send_artist_invitation_email()
RETURNS TRIGGER AS $$
DECLARE
    artist_info RECORD;
    event_info RECORD;
    email_response TEXT;
    email_subject TEXT;
    email_html TEXT;
    email_text TEXT;
    event_date TEXT;
    result_response JSONB;
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
            -- Format event date
            IF event_info.event_start_datetime IS NOT NULL THEN
                event_date := TO_CHAR(event_info.event_start_datetime, 'Day, Month DD, YYYY');
            ELSE
                event_date := 'TBD';
            END IF;

            -- Build email subject
            email_subject := 'You''re Invited! ' || event_info.eid || ' ' || COALESCE(event_info.city_name, 'Unknown');

            -- Build email HTML content
            email_html := '
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                <div style="background: #e74c3c; color: white; padding: 20px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px;">🎨 Art Battle</h1>
                </div>
                
                <div style="padding: 30px 20px;">
                    <h2 style="color: #e74c3c; margin-top: 0;">🎉 You''re Invited to Paint!</h2>
                    
                    <p>Hello <strong>' || COALESCE(artist_info.name, 'Artist') || '</strong>,</p>
                    
                    <p>Congratulations! You have been invited to participate in <strong>' || COALESCE(event_info.name, event_info.eid) || '</strong>!</p>
                    
                    <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #ffc107;">
                        <h3 style="margin-top: 0; color: #856404;">🎨 Event Details:</h3>
                        <p style="margin: 8px 0;"><strong>Event:</strong> ' || event_info.eid || ' - ' || COALESCE(event_info.name, event_info.eid) || '</p>
                        <p style="margin: 8px 0;"><strong>Date:</strong> ' || event_date || '</p>
                        <p style="margin: 8px 0;"><strong>Location:</strong> ' || COALESCE(event_info.venue, 'TBD') || '</p>
                        <p style="margin: 8px 0;"><strong>City:</strong> ' || COALESCE(event_info.city_name, 'Unknown') || '</p>
                    </div>
                    
                    <div style="background: #d4edda; padding: 20px; border-radius: 8px; margin: 25px 0;">
                        <h3 style="margin-top: 0; color: #155724;">Important - Action Required:</h3>
                        <p style="margin: 8px 0;">You need to <strong>accept this invitation</strong> to confirm your participation.</p>
                        <p style="margin: 8px 0;">Please log in to your artist dashboard to accept or decline.</p>
                    </div>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="https://artb.art/profile" 
                           style="background: #28a745; color: white; padding: 16px 32px; 
                                  text-decoration: none; border-radius: 6px; font-weight: bold; 
                                  display: inline-block; font-size: 16px;">
                            Accept Invitation
                        </a>
                    </div>
                    
                    <p style="color: #666; font-size: 14px;">Questions? Reply to this email or contact us at hello@artbattle.com</p>
                </div>
                
                <div style="background: #f8f9fa; padding: 15px 20px; text-align: center; color: #666; font-size: 12px;">
                    Art Battle - Live Competitive Painting Events<br>
                    <a href="https://artbattle.com" style="color: #e74c3c;">artbattle.com</a>
                </div>
            </div>';

            -- Build email text content
            email_text := 'Art Battle - You''re Invited to Paint!

Hello ' || COALESCE(artist_info.name, 'Artist') || ',

Congratulations! You have been invited to participate in ' || COALESCE(event_info.name, event_info.eid) || '!

Event Details:
- Event: ' || event_info.eid || ' - ' || COALESCE(event_info.name, event_info.eid) || '
- Date: ' || event_date || '
- Location: ' || COALESCE(event_info.venue, 'TBD') || '
- City: ' || COALESCE(event_info.city_name, 'Unknown') || '

IMPORTANT - ACTION REQUIRED:
You need to accept this invitation to confirm your participation.
Please log in to your artist dashboard to accept or decline.

Accept your invitation: https://artb.art/profile

Questions? Reply to this email or contact us at hello@artbattle.com

Art Battle - Live Competitive Painting Events
artbattle.com';

            -- Call the send-custom-email function via HTTP
            BEGIN
                SELECT content::TEXT INTO email_response
                FROM http((
                    'POST',
                    'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/send-custom-email',
                    ARRAY[
                        http_header('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
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

                -- Parse the response
                result_response := email_response::JSONB;
                
                IF result_response->>'success' = 'true' THEN
                    RAISE NOTICE 'Invitation email sent successfully to: %', artist_info.email;
                ELSE
                    RAISE NOTICE 'Failed to send invitation email: %', result_response->>'error';
                END IF;

            EXCEPTION
                WHEN OTHERS THEN
                    RAISE NOTICE 'Error sending invitation email to %: % - %', artist_info.email, SQLSTATE, SQLERRM;
            END;
        ELSE
            RAISE NOTICE 'Skipping invitation email - no email address or event info found for artist_profile_id: %', NEW.artist_profile_id;
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

-- Set the service role key setting (you'll need to update this with actual key)
-- This should be set in your database configuration
-- ALTER SYSTEM SET app.settings.service_role_key = 'your-service-role-key-here';
-- SELECT pg_reload_conf();