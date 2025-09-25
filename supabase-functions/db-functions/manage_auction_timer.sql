                                                                          pg_get_functiondef                                                                          
----------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.manage_auction_timer(p_art_code text, p_action text, p_timer_minutes integer DEFAULT 12)                                          +
  RETURNS jsonb                                                                                                                                                      +
  LANGUAGE plpgsql                                                                                                                                                   +
  SECURITY DEFINER                                                                                                                                                   +
  SET search_path TO 'public'                                                                                                                                        +
 AS $function$                                                                                                                                                       +
  DECLARE                                                                                                                                                            +
    v_art RECORD;                                                                                                                                                    +
    v_closing_time TIMESTAMPTZ;                                                                                                                                      +
    v_timer_seconds INTEGER;                                                                                                                                         +
  BEGIN                                                                                                                                                              +
    -- Validate action                                                                                                                                               +
    IF p_action NOT IN ('start', 'stop', 'check') THEN                                                                                                               +
      RETURN jsonb_build_object(                                                                                                                                     +
        'success', false,                                                                                                                                            +
        'error', 'Invalid action. Must be start, stop, or check'                                                                                                     +
      );                                                                                                                                                             +
    END IF;                                                                                                                                                          +
                                                                                                                                                                     +
    -- Get art details using art_code (not id!)                                                                                                                      +
    SELECT * INTO v_art                                                                                                                                              +
    FROM art                                                                                                                                                         +
    WHERE art_code = p_art_code;                                                                                                                                     +
                                                                                                                                                                     +
    IF NOT FOUND THEN                                                                                                                                                +
      RETURN jsonb_build_object(                                                                                                                                     +
        'success', false,                                                                                                                                            +
        'error', 'Art not found'                                                                                                                                     +
      );                                                                                                                                                             +
    END IF;                                                                                                                                                          +
                                                                                                                                                                     +
    -- Handle different actions                                                                                                                                      +
    CASE p_action                                                                                                                                                    +
      WHEN 'start' THEN                                                                                                                                              +
        -- Check if already has an active timer                                                                                                                      +
        IF v_art.closing_time IS NOT NULL AND v_art.closing_time > NOW() THEN                                                                                        +
          RETURN jsonb_build_object(                                                                                                                                 +
            'success', false,                                                                                                                                        +
            'error', 'Timer already active',                                                                                                                         +
            'closing_time', v_art.closing_time,                                                                                                                      +
            'seconds_remaining', EXTRACT(EPOCH FROM (v_art.closing_time - NOW()))::INTEGER                                                                           +
          );                                                                                                                                                         +
        END IF;                                                                                                                                                      +
                                                                                                                                                                     +
        -- Check if auction is active                                                                                                                                +
        IF v_art.status != 'active' THEN                                                                                                                             +
          RETURN jsonb_build_object(                                                                                                                                 +
            'success', false,                                                                                                                                        +
            'error', format('Cannot start timer - auction status is %s', v_art.status)                                                                               +
          );                                                                                                                                                         +
        END IF;                                                                                                                                                      +
                                                                                                                                                                     +
        -- Calculate closing time                                                                                                                                    +
        v_timer_seconds := p_timer_minutes * 60;                                                                                                                     +
        v_closing_time := NOW() + (v_timer_seconds || ' seconds')::INTERVAL;                                                                                         +
                                                                                                                                                                     +
        -- Update the art with closing time - use art_code in WHERE clause!                                                                                          +
        UPDATE art                                                                                                                                                   +
        SET                                                                                                                                                          +
          closing_time = v_closing_time,                                                                                                                             +
          updated_at = NOW()                                                                                                                                         +
        WHERE art_code = p_art_code;  -- Fixed: use art_code not id                                                                                                  +
                                                                                                                                                                     +
        RETURN jsonb_build_object(                                                                                                                                   +
          'success', true,                                                                                                                                           +
          'message', format('%s minute timer started', p_timer_minutes),                                                                                             +
          'closing_time', v_closing_time,                                                                                                                            +
          'seconds_remaining', v_timer_seconds                                                                                                                       +
        );                                                                                                                                                           +
                                                                                                                                                                     +
      WHEN 'stop' THEN                                                                                                                                               +
        -- Clear the timer - use art_code in WHERE clause!                                                                                                           +
        UPDATE art                                                                                                                                                   +
        SET                                                                                                                                                          +
          closing_time = NULL,                                                                                                                                       +
          updated_at = NOW()                                                                                                                                         +
        WHERE art_code = p_art_code;  -- Fixed: use art_code not id                                                                                                  +
                                                                                                                                                                     +
        RETURN jsonb_build_object(                                                                                                                                   +
          'success', true,                                                                                                                                           +
          'message', 'Timer stopped'                                                                                                                                 +
        );                                                                                                                                                           +
                                                                                                                                                                     +
      WHEN 'check' THEN                                                                                                                                              +
        -- Return current timer status                                                                                                                               +
        IF v_art.closing_time IS NULL THEN                                                                                                                           +
          RETURN jsonb_build_object(                                                                                                                                 +
            'success', true,                                                                                                                                         +
            'has_timer', false,                                                                                                                                      +
            'message', 'No timer active'                                                                                                                             +
          );                                                                                                                                                         +
        ELSIF v_art.closing_time <= NOW() THEN                                                                                                                       +
          RETURN jsonb_build_object(                                                                                                                                 +
            'success', true,                                                                                                                                         +
            'has_timer', true,                                                                                                                                       +
            'expired', true,                                                                                                                                         +
            'closing_time', v_art.closing_time,                                                                                                                      +
            'message', 'Timer has expired'                                                                                                                           +
          );                                                                                                                                                         +
        ELSE                                                                                                                                                         +
          RETURN jsonb_build_object(                                                                                                                                 +
            'success', true,                                                                                                                                         +
            'has_timer', true,                                                                                                                                       +
            'expired', false,                                                                                                                                        +
            'closing_time', v_art.closing_time,                                                                                                                      +
            'seconds_remaining', EXTRACT(EPOCH FROM (v_art.closing_time - NOW()))::INTEGER,                                                                          +
            'message', 'Timer is active'                                                                                                                             +
          );                                                                                                                                                         +
        END IF;                                                                                                                                                      +
    END CASE;                                                                                                                                                        +
                                                                                                                                                                     +
  EXCEPTION                                                                                                                                                          +
    WHEN OTHERS THEN                                                                                                                                                 +
      RETURN jsonb_build_object(                                                                                                                                     +
        'success', false,                                                                                                                                            +
        'error', 'An error occurred',                                                                                                                                +
        'detail', SQLERRM                                                                                                                                            +
      );                                                                                                                                                             +
  END;                                                                                                                                                               +
  $function$                                                                                                                                                         +
 
 CREATE OR REPLACE FUNCTION public.manage_auction_timer(p_event_id uuid, p_action text, p_duration_minutes integer DEFAULT 12, p_admin_phone text DEFAULT NULL::text)+
  RETURNS jsonb                                                                                                                                                      +
  LANGUAGE plpgsql                                                                                                                                                   +
  SECURITY DEFINER                                                                                                                                                   +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                                                                                    +
 AS $function$                                                                                                                                                       +
   DECLARE                                                                                                                                                           +
     v_event RECORD;                                                                                                                                                 +
     v_updated_count INT := 0;                                                                                                                                       +
     v_closing_time TIMESTAMP WITH TIME ZONE;                                                                                                                        +
     v_participant_count INT := 0;                                                                                                                                   +
     v_sms_count INT := 0;                                                                                                                                           +
     v_participants RECORD;                                                                                                                                          +
     v_message_id UUID;                                                                                                                                              +
     v_event_code TEXT;                                                                                                                                              +
     v_extended_count INT := 0;                                                                                                                                      +
   BEGIN                                                                                                                                                             +
     -- Validate action                                                                                                                                              +
     IF p_action NOT IN ('start', 'extend', 'cancel', 'close_now') THEN                                                                                              +
       RETURN jsonb_build_object(                                                                                                                                    +
         'success', false,                                                                                                                                           +
         'error', 'Invalid action. Must be start, extend, cancel, or close_now'                                                                                      +
       );                                                                                                                                                            +
     END IF;                                                                                                                                                         +
                                                                                                                                                                     +
     -- Get event details                                                                                                                                            +
     SELECT * INTO v_event FROM events WHERE id = p_event_id;                                                                                                        +
     IF NOT FOUND THEN                                                                                                                                               +
       RETURN jsonb_build_object('success', false, 'error', 'Event not found');                                                                                      +
     END IF;                                                                                                                                                         +
                                                                                                                                                                     +
     -- Extract event code from event name (e.g., "AB2900 - Omaha" -> "AB2900")                                                                                      +
     v_event_code := split_part(v_event.name, ' ', 1);                                                                                                               +
                                                                                                                                                                     +
     -- Check if auction is enabled for this event                                                                                                                   +
     IF NOT v_event.enable_auction THEN                                                                                                                              +
       RETURN jsonb_build_object('success', false, 'error', 'Auction not enabled for this event');                                                                   +
     END IF;                                                                                                                                                         +
                                                                                                                                                                     +
     -- Perform the requested action                                                                                                                                 +
     CASE p_action                                                                                                                                                   +
       WHEN 'start' THEN                                                                                                                                             +
         -- Set closing time for all active artworks                                                                                                                 +
         v_closing_time := NOW() + (p_duration_minutes || ' minutes')::INTERVAL;                                                                                     +
                                                                                                                                                                     +
         UPDATE art                                                                                                                                                  +
         SET                                                                                                                                                         +
           closing_time = v_closing_time,                                                                                                                            +
           auction_extended = false,                                                                                                                                 +
           extension_count = 0,                                                                                                                                      +
           updated_at = NOW()                                                                                                                                        +
         WHERE                                                                                                                                                       +
           event_id = p_event_id                                                                                                                                     +
           AND status = 'active'                                                                                                                                     +
           AND closing_time IS NULL; -- Only set if not already set                                                                                                  +
                                                                                                                                                                     +
         GET DIAGNOSTICS v_updated_count = ROW_COUNT;                                                                                                                +
                                                                                                                                                                     +
         -- Send 10-minute warning SMS to all participants                                                                                                           +
         IF p_duration_minutes >= 10 THEN                                                                                                                            +
           -- Get all unique participants (voters and bidders)                                                                                                       +
           FOR v_participants IN                                                                                                                                     +
             SELECT DISTINCT                                                                                                                                         +
               p.id as person_id,                                                                                                                                    +
               COALESCE(p.auth_phone, p.phone_number) as phone,                                                                                                      +
               p.nickname                                                                                                                                            +
             FROM people p                                                                                                                                           +
             WHERE EXISTS (                                                                                                                                          +
               -- Has voted in this event - FIXED: Cast art.id to text for comparison                                                                                +
               SELECT 1 FROM votes v                                                                                                                                 +
               JOIN art a ON v.art_id = a.id::text                                                                                                                   +
               WHERE a.event_id = p_event_id AND v.person_id = p.id                                                                                                  +
             ) OR EXISTS (                                                                                                                                           +
               -- Has bid in this event                                                                                                                              +
               SELECT 1 FROM bids b                                                                                                                                  +
               JOIN art a ON b.art_id = a.id                                                                                                                         +
               WHERE a.event_id = p_event_id AND b.person_id = p.id                                                                                                  +
             )                                                                                                                                                       +
             AND COALESCE(p.auth_phone, p.phone_number) IS NOT NULL                                                                                                  +
           LOOP                                                                                                                                                      +
             v_participant_count := v_participant_count + 1;                                                                                                         +
                                                                                                                                                                     +
             -- Send improved SMS instantly                                                                                                                          +
             v_message_id := send_sms_instantly(                                                                                                                     +
               p_destination := v_participants.phone,                                                                                                                +
               p_message_body := format(                                                                                                                             +
                 '⏰ %s auction ends in 10 minutes! Last chance to bid on your favorites: https://artb.art/e/%s/auction',                                             +
                 COALESCE(split_part(v_event.name, ' - ', 2), v_event.name),                                                                                         +
                 v_event_code                                                                                                                                        +
               ),                                                                                                                                                    +
               p_metadata := jsonb_build_object(                                                                                                                     +
                 'type', 'auction_warning',                                                                                                                          +
                 'event_id', p_event_id,                                                                                                                             +
                 'event_name', v_event.name,                                                                                                                         +
                 'event_code', v_event_code,                                                                                                                         +
                 'person_id', v_participants.person_id,                                                                                                              +
                 'admin_action', 'timer_start',                                                                                                                      +
                 'admin_phone', p_admin_phone,                                                                                                                       +
                 'message_version', 'improved_v1'                                                                                                                    +
               )                                                                                                                                                     +
             );                                                                                                                                                      +
                                                                                                                                                                     +
             IF v_message_id IS NOT NULL THEN                                                                                                                        +
               v_sms_count := v_sms_count + 1;                                                                                                                       +
             END IF;                                                                                                                                                 +
           END LOOP;                                                                                                                                                 +
         END IF;                                                                                                                                                     +
                                                                                                                                                                     +
         RETURN jsonb_build_object(                                                                                                                                  +
           'success', true,                                                                                                                                          +
           'message', format('Auction timer started for %s artworks', v_updated_count),                                                                              +
           'closing_time', v_closing_time,                                                                                                                           +
           'artworks_updated', v_updated_count,                                                                                                                      +
           'participants_notified', v_participant_count,                                                                                                             +
           'sms_sent', v_sms_count                                                                                                                                   +
         );                                                                                                                                                          +
                                                                                                                                                                     +
       WHEN 'extend' THEN                                                                                                                                            +
         -- Extend closing time by 5 minutes for all artworks with timers                                                                                            +
         UPDATE art                                                                                                                                                  +
         SET                                                                                                                                                         +
           closing_time = closing_time + INTERVAL '5 minutes',                                                                                                       +
           auction_extended = true,                                                                                                                                  +
           extension_count = extension_count + 1,                                                                                                                    +
           updated_at = NOW()                                                                                                                                        +
         WHERE                                                                                                                                                       +
           event_id = p_event_id                                                                                                                                     +
           AND status = 'active'                                                                                                                                     +
           AND closing_time IS NOT NULL                                                                                                                              +
           AND closing_time > NOW(); -- Only extend if not already passed                                                                                            +
                                                                                                                                                                     +
         GET DIAGNOSTICS v_updated_count = ROW_COUNT;                                                                                                                +
                                                                                                                                                                     +
         RETURN jsonb_build_object(                                                                                                                                  +
           'success', true,                                                                                                                                          +
           'message', format('Extended %s auction timers by 5 minutes', v_updated_count),                                                                            +
           'artworks_updated', v_updated_count                                                                                                                       +
         );                                                                                                                                                          +
                                                                                                                                                                     +
       WHEN 'cancel' THEN                                                                                                                                            +
         -- Remove all closing times                                                                                                                                 +
         UPDATE art                                                                                                                                                  +
         SET                                                                                                                                                         +
           closing_time = NULL,                                                                                                                                      +
           auction_extended = false,                                                                                                                                 +
           extension_count = 0,                                                                                                                                      +
           updated_at = NOW()                                                                                                                                        +
         WHERE                                                                                                                                                       +
           event_id = p_event_id                                                                                                                                     +
           AND closing_time IS NOT NULL;                                                                                                                             +
                                                                                                                                                                     +
         GET DIAGNOSTICS v_updated_count = ROW_COUNT;                                                                                                                +
                                                                                                                                                                     +
         RETURN jsonb_build_object(                                                                                                                                  +
           'success', true,                                                                                                                                          +
           'message', format('Cancelled timers for %s artworks', v_updated_count),                                                                                   +
           'artworks_updated', v_updated_count                                                                                                                       +
         );                                                                                                                                                          +
                                                                                                                                                                     +
       WHEN 'close_now' THEN                                                                                                                                         +
         -- FIXED: Force immediate closure of ALL active auctions regardless of recent bids                                                                          +
         -- This is admin override - no extensions, just close everything immediately                                                                                +
         UPDATE art                                                                                                                                                  +
         SET                                                                                                                                                         +
           status = 'closed',                                                                                                                                        +
           closing_time = NOW(), -- Set to now for audit trail                                                                                                       +
           updated_at = NOW()                                                                                                                                        +
         WHERE                                                                                                                                                       +
           event_id = p_event_id                                                                                                                                     +
           AND status = 'active'                                                                                                                                     +
           AND closing_time IS NOT NULL; -- Only close artworks that had active timers                                                                               +
                                                                                                                                                                     +
         GET DIAGNOSTICS v_updated_count = ROW_COUNT;                                                                                                                +
                                                                                                                                                                     +
         -- Send closure notifications to all participants who had bid or voted                                                                                      +
         FOR v_participants IN                                                                                                                                       +
           SELECT DISTINCT                                                                                                                                           +
             p.id as person_id,                                                                                                                                      +
             COALESCE(p.auth_phone, p.phone_number) as phone,                                                                                                        +
             p.nickname                                                                                                                                              +
           FROM people p                                                                                                                                             +
           WHERE EXISTS (                                                                                                                                            +
             -- Has voted in this event                                                                                                                              +
             SELECT 1 FROM votes v                                                                                                                                   +
             JOIN art a ON v.art_id = a.id::text                                                                                                                     +
             WHERE a.event_id = p_event_id AND v.person_id = p.id                                                                                                    +
           ) OR EXISTS (                                                                                                                                             +
             -- Has bid in this event                                                                                                                                +
             SELECT 1 FROM bids b                                                                                                                                    +
             JOIN art a ON b.art_id = a.id                                                                                                                           +
             WHERE a.event_id = p_event_id AND b.person_id = p.id                                                                                                    +
           )                                                                                                                                                         +
           AND COALESCE(p.auth_phone, p.phone_number) IS NOT NULL                                                                                                    +
         LOOP                                                                                                                                                        +
           v_participant_count := v_participant_count + 1;                                                                                                           +
                                                                                                                                                                     +
           -- Send closure SMS notification                                                                                                                          +
           v_message_id := send_sms_instantly(                                                                                                                       +
             p_destination := v_participants.phone,                                                                                                                  +
             p_message_body := format(                                                                                                                               +
               '🎯 %s auction is now closed! Check results and payment notifications: https://artb.art/e/%s/auction',                                                 +
               COALESCE(split_part(v_event.name, ' - ', 2), v_event.name),                                                                                           +
               v_event_code                                                                                                                                          +
             ),                                                                                                                                                      +
             p_metadata := jsonb_build_object(                                                                                                                       +
               'type', 'auction_closed',                                                                                                                             +
               'event_id', p_event_id,                                                                                                                               +
               'event_name', v_event.name,                                                                                                                           +
               'event_code', v_event_code,                                                                                                                           +
               'person_id', v_participants.person_id,                                                                                                                +
               'admin_action', 'force_close',                                                                                                                        +
               'admin_phone', p_admin_phone,                                                                                                                         +
               'message_version', 'close_now_v1'                                                                                                                     +
             )                                                                                                                                                       +
           );                                                                                                                                                        +
                                                                                                                                                                     +
           IF v_message_id IS NOT NULL THEN                                                                                                                          +
             v_sms_count := v_sms_count + 1;                                                                                                                         +
           END IF;                                                                                                                                                   +
         END LOOP;                                                                                                                                                   +
                                                                                                                                                                     +
         RETURN jsonb_build_object(                                                                                                                                  +
           'success', true,                                                                                                                                          +
           'message', format('Force closed %s auctions immediately', v_updated_count),                                                                               +
           'artworks_closed', v_updated_count,                                                                                                                       +
           'participants_notified', v_participant_count,                                                                                                             +
           'sms_sent', v_sms_count                                                                                                                                   +
         );                                                                                                                                                          +
                                                                                                                                                                     +
     END CASE;                                                                                                                                                       +
                                                                                                                                                                     +
   EXCEPTION                                                                                                                                                         +
     WHEN OTHERS THEN                                                                                                                                                +
       RETURN jsonb_build_object(                                                                                                                                    +
         'success', false,                                                                                                                                           +
         'error', 'Database error occurred',                                                                                                                         +
         'detail', SQLERRM                                                                                                                                           +
       );                                                                                                                                                            +
   END;                                                                                                                                                              +
 $function$                                                                                                                                                          +
 
(2 rows)

