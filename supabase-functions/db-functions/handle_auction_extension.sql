                                                      pg_get_functiondef                                                      
------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.handle_auction_extension(p_art_id uuid, p_bid_time timestamp with time zone DEFAULT now())+
  RETURNS jsonb                                                                                                              +
  LANGUAGE plpgsql                                                                                                           +
 AS $function$                                                                                                               +
  DECLARE                                                                                                                    +
    v_current_closing TIMESTAMPTZ;                                                                                           +
    v_time_remaining INTERVAL;                                                                                               +
    v_new_closing TIMESTAMPTZ;                                                                                               +
    v_extended BOOLEAN := false;                                                                                             +
    v_event_id UUID;                                                                                                         +
    v_channel_id VARCHAR;                                                                                                    +
  BEGIN                                                                                                                      +
    -- Get current closing time                                                                                              +
    SELECT closing_time, event_id                                                                                            +
    INTO v_current_closing, v_event_id                                                                                       +
    FROM art                                                                                                                 +
    WHERE id = p_art_id;                                                                                                     +
                                                                                                                             +
    -- If no closing time set, nothing to extend                                                                             +
    IF v_current_closing IS NULL THEN                                                                                        +
      RETURN jsonb_build_object('extended', false, 'reason', 'No closing time set');                                         +
    END IF;                                                                                                                  +
                                                                                                                             +
    -- Calculate time remaining                                                                                              +
    v_time_remaining := v_current_closing - p_bid_time;                                                                      +
                                                                                                                             +
    -- If bid is within 5 minutes of closing, extend by 5 minutes                                                            +
    IF v_time_remaining > INTERVAL '0 seconds' AND v_time_remaining <= INTERVAL '5 minutes' THEN                             +
      v_new_closing := p_bid_time + INTERVAL '5 minutes';                                                                    +
                                                                                                                             +
      -- Update the art record                                                                                               +
      UPDATE art                                                                                                             +
      SET                                                                                                                    +
        closing_time = v_new_closing,                                                                                        +
        auction_extended = true,                                                                                             +
        extension_count = extension_count + 1,                                                                               +
        updated_at = NOW()                                                                                                   +
      WHERE id = p_art_id;                                                                                                   +
                                                                                                                             +
      v_extended := true;                                                                                                    +
                                                                                                                             +
      -- Queue Slack notification for extension                                                                              +
      SELECT resolve_slack_channel(COALESCE(es.channel_name, es.channel_id))                                                 +
      INTO v_channel_id                                                                                                      +
      FROM event_slack_settings es                                                                                           +
      WHERE es.event_id = v_event_id;                                                                                        +
                                                                                                                             +
      IF v_channel_id IS NOT NULL THEN                                                                                       +
        INSERT INTO slack_notifications (                                                                                    +
          event_id,                                                                                                          +
          channel_id,                                                                                                        +
          message_type,                                                                                                      +
          payload                                                                                                            +
        ) VALUES (                                                                                                           +
          v_event_id,                                                                                                        +
          v_channel_id,                                                                                                      +
          'auction_extended',                                                                                                +
          jsonb_build_object(                                                                                                +
            'art_id', p_art_id,                                                                                              +
            'old_closing', v_current_closing,                                                                                +
            'new_closing', v_new_closing,                                                                                    +
            'extension_number', (SELECT extension_count FROM art WHERE id = p_art_id),                                       +
            'time_zone', current_setting('TIMEZONE')                                                                         +
          )                                                                                                                  +
        );                                                                                                                   +
      END IF;                                                                                                                +
    END IF;                                                                                                                  +
                                                                                                                             +
    RETURN jsonb_build_object(                                                                                               +
      'extended', v_extended,                                                                                                +
      'old_closing', v_current_closing,                                                                                      +
      'new_closing', CASE WHEN v_extended THEN v_new_closing ELSE v_current_closing END,                                     +
      'time_remaining', EXTRACT(EPOCH FROM v_time_remaining)                                                                 +
    );                                                                                                                       +
  END;                                                                                                                       +
  $function$                                                                                                                 +
 
(1 row)

