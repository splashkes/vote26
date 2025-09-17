                                      pg_get_functiondef                                      
----------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.generate_hourly_summary(p_event_id uuid)                  +
  RETURNS void                                                                               +
  LANGUAGE plpgsql                                                                           +
 AS $function$                                                                               +
  DECLARE                                                                                    +
    v_event_settings RECORD;                                                                 +
    v_voting_summary JSONB;                                                                  +
    v_auction_summary JSONB;                                                                 +
    v_message_fields JSONB;                                                                  +
  BEGIN                                                                                      +
    -- Get event settings                                                                    +
    SELECT es.*, e.name as event_name, e.eid                                                 +
    INTO v_event_settings                                                                    +
    FROM event_slack_settings es                                                             +
    JOIN events e ON es.event_id = e.id                                                      +
    WHERE es.event_id = p_event_id;                                                          +
                                                                                             +
    IF v_event_settings.channel_id IS NULL THEN                                              +
      RETURN;                                                                                +
    END IF;                                                                                  +
                                                                                             +
    -- Get summaries                                                                         +
    v_voting_summary := get_voting_summary(p_event_id);                                      +
    v_auction_summary := get_auction_summary(p_event_id);                                    +
                                                                                             +
    -- Build message fields                                                                  +
    v_message_fields := jsonb_build_array(                                                   +
      jsonb_build_object(                                                                    +
        'type', 'mrkdwn',                                                                    +
        'text', format('*Event:* %s (%s)', v_event_settings.event_name, v_event_settings.eid)+
      ),                                                                                     +
      jsonb_build_object(                                                                    +
        'type', 'mrkdwn',                                                                    +
        'text', format('*Round:* %s', v_voting_summary->>'current_round')                    +
      ),                                                                                     +
      jsonb_build_object(                                                                    +
        'type', 'mrkdwn',                                                                    +
        'text', format('*Total Votes:* %s', v_voting_summary->>'total_votes')                +
      ),                                                                                     +
      jsonb_build_object(                                                                    +
        'type', 'mrkdwn',                                                                    +
        'text', format('*Unique Voters:* %s', v_voting_summary->>'unique_voters')            +
      ),                                                                                     +
      jsonb_build_object(                                                                    +
        'type', 'mrkdwn',                                                                    +
        'text', format('*Total Bids:* %s', v_auction_summary->>'total_bids')                 +
      ),                                                                                     +
      jsonb_build_object(                                                                    +
        'type', 'mrkdwn',                                                                    +
        'text', format('*Auction Value:* $%s',                                               +
          to_char((v_auction_summary->>'total_value')::numeric, 'FM999,999.00')              +
        )                                                                                    +
      )                                                                                      +
    );                                                                                       +
                                                                                             +
    -- Queue the summary notification                                                        +
    INSERT INTO slack_notifications (                                                        +
      event_id,                                                                              +
      channel_id,                                                                            +
      message_type,                                                                          +
      payload                                                                                +
    ) VALUES (                                                                               +
      p_event_id,                                                                            +
      v_event_settings.channel_id,                                                           +
      'hourly_summary',                                                                      +
      jsonb_build_object(                                                                    +
        'message', format('Hourly Summary for %s', v_event_settings.event_name),             +
        'leaders', v_voting_summary->'leaders',                                              +
        'fields', v_message_fields,                                                          +
        'voting_summary', v_voting_summary,                                                  +
        'auction_summary', v_auction_summary                                                 +
      )                                                                                      +
    );                                                                                       +
  END;                                                                                       +
  $function$                                                                                 +
 
(1 row)

