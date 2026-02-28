-- Fix invitation email timezone date rendering for accented city names and timezone_icann usage
-- Date: 2026-02-28
-- Issue: invitation emails can show incorrect local date when city names are accented (e.g. Montreal variants)
--        or when timezone_icann is present but not used by send_artist_invitation_email.

CREATE OR REPLACE FUNCTION public.format_event_datetime_local(utc_datetime timestamp with time zone, city_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
    venue_timezone text := 'UTC';
    normalized_city text;
    local_datetime timestamp;
BEGIN
    IF utc_datetime IS NULL THEN
        RETURN 'TBD';
    END IF;

    -- If caller passes an IANA timezone (e.g. America/Toronto), use it directly.
    IF city_name IS NOT NULL AND POSITION('/' IN city_name) > 0 THEN
        BEGIN
            local_datetime := utc_datetime AT TIME ZONE city_name;
            RETURN TO_CHAR(local_datetime, 'Mon DD, YYYY');
        EXCEPTION
            WHEN OTHERS THEN
                -- Fall through to city mapping.
                NULL;
        END;
    END IF;

    -- Normalize city values for accent/case variations such as Montreal / Montréal.
    normalized_city := lower(trim(COALESCE(city_name, '')));
    normalized_city := replace(normalized_city, 'é', 'e');
    normalized_city := replace(normalized_city, 'è', 'e');
    normalized_city := replace(normalized_city, 'ê', 'e');
    normalized_city := replace(normalized_city, 'ë', 'e');

    venue_timezone := CASE normalized_city
        WHEN 'toronto' THEN 'America/Toronto'
        WHEN 'amsterdam' THEN 'Europe/Amsterdam'
        WHEN 'bangkok' THEN 'Asia/Bangkok'
        WHEN 'san francisco' THEN 'America/Los_Angeles'
        WHEN 'oakland' THEN 'America/Los_Angeles'
        WHEN 'boston' THEN 'America/New_York'
        WHEN 'seattle' THEN 'America/Los_Angeles'
        WHEN 'sydney' THEN 'Australia/Sydney'
        WHEN 'auckland' THEN 'Pacific/Auckland'
        WHEN 'ottawa' THEN 'America/Toronto'
        WHEN 'wilmington' THEN 'America/New_York'
        WHEN 'lancaster' THEN 'America/New_York'
        WHEN 'montreal' THEN 'America/Toronto'
        WHEN 'vancouver' THEN 'America/Vancouver'
        WHEN 'melbourne' THEN 'Australia/Melbourne'
        WHEN 'brisbane' THEN 'Australia/Brisbane'
        WHEN 'perth' THEN 'Australia/Perth'
        WHEN 'new york' THEN 'America/New_York'
        WHEN 'los angeles' THEN 'America/Los_Angeles'
        WHEN 'chicago' THEN 'America/Chicago'
        WHEN 'london' THEN 'Europe/London'
        WHEN 'paris' THEN 'Europe/Paris'
        WHEN 'berlin' THEN 'Europe/Berlin'
        WHEN 'tokyo' THEN 'Asia/Tokyo'
        WHEN 'singapore' THEN 'Asia/Singapore'
        ELSE 'UTC'
    END;

    local_datetime := utc_datetime AT TIME ZONE venue_timezone;
    RETURN TO_CHAR(local_datetime, 'Mon DD, YYYY');
END;
$function$;

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
        -- Get artist profile information including email from all possible sources.
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

        -- Get event information including timezone_icann and city.
        SELECT e.name, e.eid, e.event_start_datetime, e.venue, e.timezone_icann, c.name as city_name
        INTO event_info
        FROM events e
        LEFT JOIN cities c ON e.city_id = c.id
        WHERE e.eid = NEW.event_eid;

        RAISE NOTICE 'Email check for artist %. Profile: %, People: %, Auth: %, Final: %',
                     artist_info.name,
                     COALESCE(artist_info.profile_email, 'NULL'),
                     COALESCE(artist_info.people_email, 'NULL'),
                     COALESCE(artist_info.auth_email, 'NULL'),
                     COALESCE(artist_info.email, 'NULL');

        IF artist_info.email IS NOT NULL AND event_info IS NOT NULL THEN
            RAISE NOTICE 'Sending invitation email to: % for event: %', artist_info.email, event_info.eid;

            city_name := COALESCE(event_info.city_name, 'Unknown City');

            IF event_info.event_start_datetime IS NOT NULL THEN
                event_date := format_event_datetime_local(
                    event_info.event_start_datetime,
                    COALESCE(NULLIF(TRIM(event_info.timezone_icann), ''), city_name)
                );
            ELSE
                event_date := 'TBD';
            END IF;

            email_subject := 'You''re Invited\! ' || event_info.eid || ' ' || city_name;

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

COMMENT ON FUNCTION public.format_event_datetime_local(timestamp with time zone, text)
IS 'Converts UTC datetime to local venue timezone and formats Mon DD, YYYY; accepts timezone_icann or city names.';

COMMENT ON FUNCTION public.send_artist_invitation_email()
IS 'Sends invitation email on artist invite trigger; date prefers events.timezone_icann with city fallback.';
