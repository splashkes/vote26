                                                              pg_get_functiondef                                                              
----------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.notify_profile_update_slack()                                                                             +
  RETURNS trigger                                                                                                                            +
  LANGUAGE plpgsql                                                                                                                           +
  SECURITY DEFINER                                                                                                                           +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                                                            +
 AS $function$                                                                                                                               +
  DECLARE                                                                                                                                    +
      v_notification_id UUID;                                                                                                                +
      v_artist_name TEXT;                                                                                                                    +
      v_profile_email TEXT;                                                                                                                  +
      v_profile_phone TEXT;                                                                                                                  +
      v_person_email TEXT;                                                                                                                   +
      v_person_phone TEXT;                                                                                                                   +
      v_slack_text TEXT;                                                                                                                     +
      v_slack_blocks JSONB;                                                                                                                  +
      v_changed_fields TEXT[];                                                                                                               +
      v_changes_text TEXT;                                                                                                                   +
  BEGIN                                                                                                                                      +
      -- Get artist name                                                                                                                     +
      v_artist_name := COALESCE(NEW.name, 'Unknown Artist');                                                                                 +
                                                                                                                                             +
      -- Get contact info from artist_profiles                                                                                               +
      v_profile_email := NEW.email;                                                                                                          +
      v_profile_phone := NEW.phone;                                                                                                          +
                                                                                                                                             +
      -- Get contact info from people table                                                                                                  +
      SELECT p.email, p.phone                                                                                                                +
      INTO v_person_email, v_person_phone                                                                                                    +
      FROM people p                                                                                                                          +
      WHERE p.id = NEW.person_id;                                                                                                            +
                                                                                                                                             +
      -- Track changed fields (only for updates, not inserts)                                                                                +
      IF TG_OP = 'UPDATE' THEN                                                                                                               +
          v_changed_fields := ARRAY[]::TEXT[];                                                                                               +
                                                                                                                                             +
          -- Check which fields changed                                                                                                      +
          IF OLD.name IS DISTINCT FROM NEW.name THEN                                                                                         +
              v_changed_fields := array_append(v_changed_fields, 'name');                                                                    +
          END IF;                                                                                                                            +
          IF OLD.email IS DISTINCT FROM NEW.email THEN                                                                                       +
              v_changed_fields := array_append(v_changed_fields, 'email');                                                                   +
          END IF;                                                                                                                            +
          IF OLD.phone IS DISTINCT FROM NEW.phone THEN                                                                                       +
              v_changed_fields := array_append(v_changed_fields, 'phone');                                                                   +
          END IF;                                                                                                                            +
          IF OLD.bio IS DISTINCT FROM NEW.bio THEN                                                                                           +
              v_changed_fields := array_append(v_changed_fields, 'bio');                                                                     +
          END IF;                                                                                                                            +
          IF OLD.city IS DISTINCT FROM NEW.city THEN                                                                                         +
              v_changed_fields := array_append(v_changed_fields, 'city');                                                                    +
          END IF;                                                                                                                            +
          IF OLD.country IS DISTINCT FROM NEW.country THEN                                                                                   +
              v_changed_fields := array_append(v_changed_fields, 'country');                                                                 +
          END IF;                                                                                                                            +
          IF OLD.website IS DISTINCT FROM NEW.website THEN                                                                                   +
              v_changed_fields := array_append(v_changed_fields, 'website');                                                                 +
          END IF;                                                                                                                            +
          IF OLD.instagram IS DISTINCT FROM NEW.instagram THEN                                                                               +
              v_changed_fields := array_append(v_changed_fields, 'instagram');                                                               +
          END IF;                                                                                                                            +
          IF OLD.pronouns IS DISTINCT FROM NEW.pronouns THEN                                                                                 +
              v_changed_fields := array_append(v_changed_fields, 'pronouns');                                                                +
          END IF;                                                                                                                            +
                                                                                                                                             +
          -- Create changes text                                                                                                             +
          IF array_length(v_changed_fields, 1) > 0 THEN                                                                                      +
              v_changes_text := 'Fields updated: ' || array_to_string(v_changed_fields, ', ');                                               +
          ELSE                                                                                                                               +
              v_changes_text := 'Profile metadata updated';                                                                                  +
          END IF;                                                                                                                            +
      ELSE                                                                                                                                   +
          v_changes_text := 'New profile created';                                                                                           +
      END IF;                                                                                                                                +
                                                                                                                                             +
      -- Build Slack message text                                                                                                            +
      v_slack_text := '📝 Profile Updated Successfully - ' || v_artist_name;                                                                  +
                                                                                                                                             +
      -- Build Slack blocks with contact information                                                                                         +
      v_slack_blocks := jsonb_build_object(                                                                                                  +
          'blocks', jsonb_build_array(                                                                                                       +
              -- Header                                                                                                                      +
              jsonb_build_object(                                                                                                            +
                  'type', 'header',                                                                                                          +
                  'text', jsonb_build_object(                                                                                                +
                      'type', 'plain_text',                                                                                                  +
                      'text', '📝 Profile Updated Successfully'                                                                               +
                  )                                                                                                                          +
              ),                                                                                                                             +
              -- Artist info section                                                                                                         +
              jsonb_build_object(                                                                                                            +
                  'type', 'section',                                                                                                         +
                  'fields', jsonb_build_array(                                                                                               +
                      jsonb_build_object(                                                                                                    +
                          'type', 'mrkdwn',                                                                                                  +
                          'text', '*Artist:*' || E'\n' || v_artist_name                                                                      +
                      ),                                                                                                                     +
                      jsonb_build_object(                                                                                                    +
                          'type', 'mrkdwn',                                                                                                  +
                          'text', '*Changes:*' || E'\n' || v_changes_text                                                                    +
                      )                                                                                                                      +
                  )                                                                                                                          +
              ),                                                                                                                             +
              -- Contact information section                                                                                                 +
              jsonb_build_object(                                                                                                            +
                  'type', 'section',                                                                                                         +
                  'fields', jsonb_build_array(                                                                                               +
                      jsonb_build_object(                                                                                                    +
                          'type', 'mrkdwn',                                                                                                  +
                          'text', '*Profile Email:*' || E'\n' || COALESCE(v_profile_email, 'Not set')                                        +
                      ),                                                                                                                     +
                      jsonb_build_object(                                                                                                    +
                          'type', 'mrkdwn',                                                                                                  +
                          'text', '*Profile Phone:*' || E'\n' || COALESCE(v_profile_phone, 'Not set')                                        +
                      )                                                                                                                      +
                  )                                                                                                                          +
              ),                                                                                                                             +
              jsonb_build_object(                                                                                                            +
                  'type', 'section',                                                                                                         +
                  'fields', jsonb_build_array(                                                                                               +
                      jsonb_build_object(                                                                                                    +
                          'type', 'mrkdwn',                                                                                                  +
                          'text', '*People Email:*' || E'\n' || COALESCE(v_person_email, 'Not set')                                          +
                      ),                                                                                                                     +
                      jsonb_build_object(                                                                                                    +
                          'type', 'mrkdwn',                                                                                                  +
                          'text', '*People Phone:*' || E'\n' || COALESCE(v_person_phone, 'Not set')                                          +
                      )                                                                                                                      +
                  )                                                                                                                          +
              ),                                                                                                                             +
              -- Metadata                                                                                                                    +
              jsonb_build_object(                                                                                                            +
                  'type', 'context',                                                                                                         +
                  'elements', jsonb_build_array(                                                                                             +
                      jsonb_build_object(                                                                                                    +
                          'type', 'mrkdwn',                                                                                                  +
                          'text', 'Profile ID: `' || NEW.id::text || '` | Person ID: `' || COALESCE(NEW.person_id::text, 'None') || '` | ' ||+
                                  to_char(NEW.updated_at, 'YYYY-MM-DD HH24:MI:SS UTC')                                                       +
                      )                                                                                                                      +
                  )                                                                                                                          +
              )                                                                                                                              +
          )                                                                                                                                  +
      );                                                                                                                                     +
                                                                                                                                             +
      -- Queue the Slack notification                                                                                                        +
      SELECT queue_slack_notification(                                                                                                       +
          'general',  -- Channel name                                                                                                        +
          'profile_update',  -- Message type                                                                                                 +
          v_slack_text,  -- Simple text                                                                                                      +
          v_slack_blocks,  -- Rich blocks                                                                                                    +
          NULL  -- No specific event ID                                                                                                      +
      ) INTO v_notification_id;                                                                                                              +
                                                                                                                                             +
      RAISE NOTICE 'Profile update Slack notification queued: % for artist: %', v_notification_id, v_artist_name;                            +
                                                                                                                                             +
      RETURN NEW;                                                                                                                            +
  END;                                                                                                                                       +
  $function$                                                                                                                                 +
 
(1 row)

