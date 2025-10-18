-- Fix timezone issues in Slack notifications for artist applications and confirmations
-- Date: 2025-10-16
-- Issue: Slack notifications were showing event dates in UTC instead of local venue timezone

-- Create helper function to convert UTC datetime to local venue timezone
CREATE OR REPLACE FUNCTION format_event_datetime_local(
    utc_datetime TIMESTAMPTZ,
    city_name TEXT
) RETURNS TEXT AS $$
DECLARE
    venue_timezone TEXT;
    local_datetime TIMESTAMP;
BEGIN
    -- Map city names to timezones
    venue_timezone := CASE city_name
        WHEN 'Toronto' THEN 'America/Toronto'
        WHEN 'Amsterdam' THEN 'Europe/Amsterdam'
        WHEN 'Bangkok' THEN 'Asia/Bangkok'
        WHEN 'San Francisco' THEN 'America/Los_Angeles'
        WHEN 'Oakland' THEN 'America/Los_Angeles'
        WHEN 'Boston' THEN 'America/New_York'
        WHEN 'Seattle' THEN 'America/Los_Angeles'
        WHEN 'Sydney' THEN 'Australia/Sydney'
        WHEN 'Auckland' THEN 'Pacific/Auckland'
        WHEN 'Ottawa' THEN 'America/Toronto'
        WHEN 'Wilmington' THEN 'America/New_York'
        WHEN 'Lancaster' THEN 'America/New_York'
        WHEN 'Montreal' THEN 'America/Toronto'
        WHEN 'Vancouver' THEN 'America/Vancouver'
        WHEN 'Melbourne' THEN 'Australia/Melbourne'
        WHEN 'Brisbane' THEN 'Australia/Brisbane'
        WHEN 'Perth' THEN 'Australia/Perth'
        WHEN 'New York' THEN 'America/New_York'
        WHEN 'Los Angeles' THEN 'America/Los_Angeles'
        WHEN 'Chicago' THEN 'America/Chicago'
        WHEN 'London' THEN 'Europe/London'
        WHEN 'Paris' THEN 'Europe/Paris'
        WHEN 'Berlin' THEN 'Europe/Berlin'
        WHEN 'Tokyo' THEN 'Asia/Tokyo'
        WHEN 'Singapore' THEN 'Asia/Singapore'
        ELSE 'UTC'
    END;

    -- Convert to local timezone
    local_datetime := utc_datetime AT TIME ZONE venue_timezone;

    -- Format for Slack: "Mon DD, YYYY"
    RETURN TO_CHAR(local_datetime, 'Mon DD, YYYY');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update notify_artist_application_slack to use timezone-aware formatting
CREATE OR REPLACE FUNCTION public.notify_artist_application_slack()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
 DECLARE
     artist_info RECORD;
     event_info RECORD;
     slack_channel TEXT;
     slack_channel_id TEXT;
     message_preview TEXT;
     payload_data JSONB;
     slack_blocks JSONB;
     main_text TEXT;
     header_text TEXT;
     notification_text TEXT;
     event_date TEXT;
     city_name TEXT;
     result_id UUID;
     sample_image_url TEXT;
 BEGIN
     BEGIN
         -- Validate required data exists
         IF NEW.artist_profile_id IS NULL OR NEW.event_eid IS NULL THEN
             RAISE NOTICE 'Slack notification skipped: missing required data for application %', NEW.id;
             RETURN NEW;
         END IF;

         -- Get artist profile information
         SELECT ap.name, ap.bio, ap.city, ap.country
         INTO artist_info
         FROM artist_profiles ap
         WHERE ap.id = NEW.artist_profile_id;

         IF NOT FOUND THEN
             RAISE NOTICE 'Slack notification skipped: Artist profile % not found', NEW.artist_profile_id;
             RETURN NEW;
         END IF;

         -- Get event information INCLUDING slack_channel and city
         SELECT e.name, e.eid, e.event_start_datetime, e.id, e.slack_channel, c.name as city_name
         INTO event_info
         FROM events e
         LEFT JOIN cities c ON e.city_id = c.id
         WHERE e.eid = NEW.event_eid;

         IF NOT FOUND THEN
             RAISE NOTICE 'Slack notification skipped: Event % not found', NEW.event_eid;
             RETURN NEW;
         END IF;

         -- Get city name
         city_name := COALESCE(event_info.city_name, 'Unknown City');

         -- Format event date in LOCAL VENUE TIMEZONE
         IF event_info.event_start_datetime IS NOT NULL THEN
             event_date := format_event_datetime_local(event_info.event_start_datetime, city_name);
         ELSE
             event_date := 'TBD';
         END IF;

         -- Get first sample work image - simplified
         sample_image_url := NULL;
         BEGIN
             SELECT image_url
             INTO sample_image_url
             FROM get_unified_sample_works(NEW.artist_profile_id)
             WHERE image_url IS NOT NULL
             LIMIT 1;
         EXCEPTION
             WHEN OTHERS THEN
                 RAISE NOTICE 'Error getting sample work for profile %: %', NEW.artist_profile_id, SQLERRM;
                 sample_image_url := NULL;
         END;

         -- Use event's slack_channel if set, otherwise fallback to artist-notify
         IF event_info.slack_channel IS NOT NULL AND TRIM(event_info.slack_channel) != '' THEN
             slack_channel := TRIM(event_info.slack_channel);
             -- Remove # prefix if present
             IF LEFT(slack_channel, 1) = '#' THEN
                 slack_channel := SUBSTRING(slack_channel FROM 2);
             END IF;
         ELSE
             slack_channel := 'artist-notify';
         END IF;

         -- Resolve channel ID directly
         slack_channel_id := resolve_slack_channel(slack_channel);

         -- Use application message instead of bio
         IF NEW.message_to_producer IS NOT NULL AND LENGTH(TRIM(NEW.message_to_producer)) > 0 THEN
             message_preview := LEFT(TRIM(NEW.message_to_producer), 150);
             IF LENGTH(NEW.message_to_producer) > 150 THEN
                 message_preview := message_preview || '...';
             END IF;
         ELSE
             message_preview := '_No message provided_';
         END IF;

         -- Header format with emoji: "📝 ARTIST NAME applied to ABXXXX (CITY - DATE IN LOCAL TIME)"
         header_text := '📝 ' || COALESCE(TRIM(artist_info.name), 'Unknown Artist') || ' applied to ' ||
                        NEW.event_eid || ' (' || city_name || ' - ' || event_date || ')';

         -- Notification text with emoji
         notification_text := '📝 ' || COALESCE(TRIM(artist_info.name), 'Unknown Artist') || ' applied to ' || NEW.event_eid;

         -- Main text format with admin link (no emoji here since it's in the header)
         main_text := '*' || COALESCE(TRIM(artist_info.name), 'Unknown') || '* - <https://artb.art/admin/artist/' ||
                      COALESCE(NEW.artist_number::TEXT, 'N/A') || '|Artist #' ||
                      COALESCE(NEW.artist_number::TEXT, 'N/A') || '>' || E'\n' ||
                      COALESCE(TRIM(artist_info.city), 'Unknown') || ', ' ||
                      COALESCE(TRIM(artist_info.country), 'Unknown') || E'\n\n' ||
                      message_preview;

         -- Create simplified blocks
         slack_blocks := jsonb_build_array(
             jsonb_build_object(
                 'type', 'header',
                 'text', jsonb_build_object(
                     'type', 'plain_text',
                     'text', header_text,
                     'emoji', true
                 )
             )
         );

         -- Add main section with optional image
         IF sample_image_url IS NOT NULL THEN
             -- Section with image accessory
             slack_blocks := slack_blocks || jsonb_build_array(
                 jsonb_build_object(
                     'type', 'section',
                     'text', jsonb_build_object(
                         'type', 'mrkdwn',
                         'text', main_text
                     ),
                     'accessory', jsonb_build_object(
                         'type', 'image',
                         'image_url', sample_image_url,
                         'alt_text', 'Sample artwork'
                     )
                 )
             );
         ELSE
             -- Section without image
             slack_blocks := slack_blocks || jsonb_build_array(
                 jsonb_build_object(
                     'type', 'section',
                     'text', jsonb_build_object(
                         'type', 'mrkdwn',
                         'text', main_text
                     )
                 )
             );
         END IF;

         -- Add context footer
         slack_blocks := slack_blocks || jsonb_build_array(
             jsonb_build_object(
                 'type', 'context',
                 'elements', jsonb_build_array(
                     jsonb_build_object(
                         'type', 'mrkdwn',
                         'text', '*Event:* ' || COALESCE(TRIM(event_info.name), NEW.event_eid) ||
                                 ' - *Applied:* ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI') || ' UTC'
                     )
                 )
             )
         );

         payload_data := jsonb_build_object(
             'blocks', slack_blocks,
             'text', notification_text,
             'artist_name', TRIM(artist_info.name),
             'artist_number', NEW.artist_number,
             'event_eid', NEW.event_eid,
             'event_slack_channel', slack_channel
         );

         -- Insert notification directly with resolved channel ID
         IF slack_channel_id IS NOT NULL THEN
             -- Direct send with channel ID
             INSERT INTO slack_notifications (
                 event_id,
                 channel_id,
                 message_type,
                 payload,
                 status
             ) VALUES (
                 event_info.id,
                 slack_channel_id,
                 'artist_application',
                 payload_data,
                 'pending'
             ) RETURNING id INTO result_id;

             RAISE NOTICE 'Slack notification queued DIRECT for application %: %', NEW.id, result_id;
         ELSE
             -- Fallback to lookup
             INSERT INTO slack_notifications (
                 event_id,
                 channel_id,
                 message_type,
                 payload,
                 status
             ) VALUES (
                 event_info.id,
                 NULL,
                 'artist_application',
                 payload_data || jsonb_build_object('channel_name', slack_channel, 'needs_channel_lookup', true),
                 'pending_lookup'
             ) RETURNING id INTO result_id;

             RAISE NOTICE 'Slack notification queued LOOKUP for application %: %', NEW.id, result_id;
         END IF;

     EXCEPTION
         WHEN OTHERS THEN
             RAISE NOTICE 'Slack notification error for application %: % - %', NEW.id, SQLSTATE, SQLERRM;
     END;

     RETURN NEW;
 END;
 $function$;

-- Update notify_artist_confirmation_slack to use timezone-aware formatting
CREATE OR REPLACE FUNCTION public.notify_artist_confirmation_slack()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
 DECLARE
     artist_info RECORD;
     event_info RECORD;
     slack_channel TEXT;
     slack_blocks JSONB;
     notification_id UUID;
     legal_name TEXT;
     pronouns TEXT;
     social_info TEXT;
     confirmation_message TEXT;
     event_date_local TEXT;
     city_name TEXT;
 BEGIN
     BEGIN
         -- Get artist profile information
         SELECT ap.name, ap.city, ap.country, ap.pronouns
         INTO artist_info
         FROM artist_profiles ap
         WHERE ap.id = NEW.artist_profile_id;

         -- Get event information INCLUDING city
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

         -- Determine Slack channel from event or fallback
         IF event_info.slack_channel IS NOT NULL AND LENGTH(TRIM(event_info.slack_channel)) > 0 THEN
             slack_channel := regexp_replace(TRIM(event_info.slack_channel), '^https://hooks\.slack\.com.*$', 'general');
             slack_channel := LTRIM(slack_channel, '#');
         ELSE
             slack_channel := 'artist-notify';
         END IF;

         -- Extract confirmation-specific data
         legal_name := COALESCE(NEW.legal_name, 'Not provided');

         -- Get pronouns from artist_profiles first, fallback to social_usernames, then metadata
         pronouns := COALESCE(
             NULLIF(TRIM(artist_info.pronouns), ''),
             NULLIF(NEW.social_usernames->>'pronouns', ''),
             NULLIF(NEW.metadata->>'pronouns', ''),
             'Not specified'
         );

         -- Get social media info from social_usernames
         IF NEW.social_usernames IS NOT NULL AND NEW.social_usernames != '{}'::jsonb THEN
             social_info := COALESCE(
                 CONCAT_WS(' • ',
                     CASE WHEN NEW.social_usernames->>'instagram' IS NOT NULL
                          THEN 'IG: @' || (NEW.social_usernames->>'instagram') END,
                     CASE WHEN NEW.social_usernames->>'twitter' IS NOT NULL
                          THEN 'X: @' || (NEW.social_usernames->>'twitter') END,
                     CASE WHEN NEW.social_usernames->>'tiktok' IS NOT NULL
                          THEN 'TT: @' || (NEW.social_usernames->>'tiktok') END
                 ),
                 'No social media provided'
             );
         ELSE
             social_info := 'No social media provided';
         END IF;

         confirmation_message := COALESCE(NEW.message_to_organizers, 'No message provided');

         -- Build rich Slack blocks with artist name as title (matching invite style)
         slack_blocks := jsonb_build_array(
             -- Header block with artist name and event (same style as invites)
             jsonb_build_object(
                 'type', 'header',
                 'text', jsonb_build_object(
                     'type', 'plain_text',
                     'text', COALESCE(TRIM(artist_info.name), 'Artist') || ' confirmed for ' || COALESCE(TRIM(event_info.eid), 'Event'),
                     'emoji', true
                 )
             ),
             -- Artist confirmation details
             jsonb_build_object(
                 'type', 'section',
                 'fields', jsonb_build_array(
                     jsonb_build_object(
                         'type', 'mrkdwn',
                         'text', '*Legal Name:*' || E'\n' || legal_name
                     ),
                     jsonb_build_object(
                         'type', 'mrkdwn',
                         'text', '*Pronouns:*' || E'\n' || pronouns
                     ),
                     jsonb_build_object(
                         'type', 'mrkdwn',
                         'text', '*Location:*' || E'\n' ||
                                 COALESCE(TRIM(artist_info.city), 'Unknown') || ', ' ||
                                 COALESCE(TRIM(artist_info.country), 'Unknown')
                     ),
                     jsonb_build_object(
                         'type', 'mrkdwn',
                         'text', '*Artist #:*' || E'\n' || COALESCE(NEW.artist_number::TEXT, 'N/A')
                     )
                 )
             )
         );

         -- Add social media section if available
         IF social_info != 'No social media provided' THEN
             slack_blocks := slack_blocks || jsonb_build_array(
                 jsonb_build_object(
                     'type', 'section',
                     'text', jsonb_build_object(
                         'type', 'mrkdwn',
                         'text', '*Social Media:*' || E'\n' || social_info
                     )
                 )
             );
         END IF;

         -- Add message to organizers if provided
         IF confirmation_message != 'No message provided' THEN
             slack_blocks := slack_blocks || jsonb_build_array(
                 jsonb_build_object(
                     'type', 'section',
                     'text', jsonb_build_object(
                         'type', 'mrkdwn',
                         'text', '*Message to Organizers:*' || E'\n' ||
                                 LEFT(confirmation_message, 200) ||
                                 CASE WHEN LENGTH(confirmation_message) > 200 THEN '...' ELSE '' END
                     )
                 )
             );
         END IF;

         -- Context with event details using LOCAL TIMEZONE DATE
         slack_blocks := slack_blocks || jsonb_build_array(
             jsonb_build_object(
                 'type', 'context',
                 'elements', jsonb_build_array(
                     jsonb_build_object(
                         'type', 'mrkdwn',
                         'text', '*Event:* ' || COALESCE(event_info.name, 'Unknown Event') || ' • ' ||
                                 event_date_local ||
                                 ' • *Confirmed:* ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI UTC')
                     )
                 )
             )
         );

         -- Queue the notification
         SELECT queue_slack_notification(
             slack_channel,
             'artist_confirmation',
             COALESCE(TRIM(artist_info.name), 'Artist') || ' confirmed for ' || COALESCE(TRIM(event_info.eid), 'Event'),
             slack_blocks,
             event_info.id
         ) INTO notification_id;

         RAISE NOTICE 'Rich artist confirmation notification queued: % to channel: %', notification_id, slack_channel;

     EXCEPTION
         WHEN OTHERS THEN
             RAISE NOTICE 'Slack notification error for confirmation %: % - %', NEW.id, SQLSTATE, SQLERRM;
     END;

     RETURN NEW;
 END;
 $function$;

-- Add comment to document the fix
COMMENT ON FUNCTION format_event_datetime_local IS 'Converts UTC datetime to local venue timezone and formats for Slack notifications';
COMMENT ON FUNCTION notify_artist_application_slack IS 'Sends Slack notification when artist applies - date shown in local venue timezone';
COMMENT ON FUNCTION notify_artist_confirmation_slack IS 'Sends Slack notification when artist confirms - date shown in local venue timezone';
