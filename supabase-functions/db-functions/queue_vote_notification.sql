                                             pg_get_functiondef                                             
------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.queue_vote_notification()                                               +
  RETURNS trigger                                                                                          +
  LANGUAGE plpgsql                                                                                         +
 AS $function$                                                                                             +
  DECLARE                                                                                                  +
    v_event_settings RECORD;                                                                               +
    v_vote_count INT;                                                                                      +
    v_artist_name VARCHAR;                                                                                 +
    v_event_name VARCHAR;                                                                                  +
    v_channel VARCHAR;                                                                                     +
  BEGIN                                                                                                    +
    -- Get event slack settings                                                                            +
    SELECT es.*, e.name as event_name, e.slack_channel                                                     +
    INTO v_event_settings                                                                                  +
    FROM event_slack_settings es                                                                           +
    JOIN events e ON e.id = es.event_id                                                                    +
    WHERE es.event_id = NEW.event_id;                                                                      +
                                                                                                           +
    -- Determine which channel to use (prefer settings, fallback to event)                                 +
    -- Always use friendly names, never IDs                                                                +
    v_channel := COALESCE(                                                                                 +
      CASE                                                                                                 +
        WHEN v_event_settings.channel_name ~ '^[CGD][0-9A-Z]+$' THEN 'general'  -- Convert ID back to name +
        ELSE v_event_settings.channel_name                                                                 +
      END,                                                                                                 +
      CASE                                                                                                 +
        WHEN v_event_settings.slack_channel ~ '^[CGD][0-9A-Z]+$' THEN 'general'  -- Convert ID back to name+
        ELSE v_event_settings.slack_channel                                                                +
      END,                                                                                                 +
      'general'  -- Ultimate fallback                                                                      +
    );                                                                                                     +
                                                                                                           +
    -- Only proceed if notifications are enabled and channel is set                                        +
    IF v_event_settings.vote_notifications AND v_channel IS NOT NULL THEN                                  +
      -- Get current vote count for this art piece                                                         +
      SELECT COUNT(*) INTO v_vote_count                                                                    +
      FROM votes                                                                                           +
      WHERE art_id = NEW.art_id;                                                                           +
                                                                                                           +
      -- Get artist name                                                                                   +
      SELECT ap.name INTO v_artist_name                                                                    +
      FROM art a                                                                                           +
      JOIN artist_profiles ap ON a.artist_id = ap.id                                                       +
      WHERE a.id = NEW.art_id;                                                                             +
                                                                                                           +
      -- Queue notification for every 10th vote to avoid spam                                              +
      IF v_vote_count % 10 = 0 OR v_vote_count = 1 THEN                                                    +
        PERFORM queue_notification_with_cache_only(                                                        +
          NEW.event_id,                                                                                    +
          v_channel,                                                                                       +
          'vote_update',                                                                                   +
          jsonb_build_object(                                                                              +
            'art_id', NEW.art_id,                                                                          +
            'artist_name', v_artist_name,                                                                  +
            'vote_count', v_vote_count,                                                                    +
            'round', NEW.round,                                                                            +
            'voter_id', NEW.person_id                                                                      +
          )                                                                                                +
        );                                                                                                 +
      END IF;                                                                                              +
                                                                                                           +
      -- Check for milestones                                                                              +
      IF v_vote_count IN (100, 500, 1000, 5000) THEN                                                       +
        PERFORM queue_notification_with_cache_only(                                                        +
          NEW.event_id,                                                                                    +
          v_channel,                                                                                       +
          'vote_milestone',                                                                                +
          jsonb_build_object(                                                                              +
            'milestone', v_vote_count,                                                                     +
            'event_name', v_event_settings.event_name                                                      +
          )                                                                                                +
        );                                                                                                 +
      END IF;                                                                                              +
    END IF;                                                                                                +
                                                                                                           +
    RETURN NEW;                                                                                            +
  END;                                                                                                     +
  $function$                                                                                               +
 
(1 row)

