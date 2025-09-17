                                                         pg_get_functiondef                                                         
------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.send_rich_winner_notification(p_art_id uuid)                                                    +
  RETURNS void                                                                                                                     +
  LANGUAGE plpgsql                                                                                                                 +
 AS $function$                                                                                                                     +
  DECLARE                                                                                                                          +
    v_art RECORD;                                                                                                                  +
    v_winner RECORD;                                                                                                               +
    v_stats RECORD;                                                                                                                +
    v_channel_id VARCHAR;                                                                                                          +
    v_total_with_tax NUMERIC;                                                                                                      +
    v_slack_data JSONB;                                                                                                            +
  BEGIN                                                                                                                            +
    -- Get art and event details                                                                                                   +
    SELECT                                                                                                                         +
      a.*,                                                                                                                         +
      e.name as event_name,                                                                                                        +
      e.currency,                                                                                                                  +
      e.tax,                                                                                                                       +
      ap.name as artist_name                                                                                                       +
    INTO v_art                                                                                                                     +
    FROM art a                                                                                                                     +
    JOIN events e ON a.event_id = e.id                                                                                             +
    LEFT JOIN artist_profiles ap ON a.artist_id = ap.id                                                                            +
    WHERE a.id = p_art_id;                                                                                                         +
                                                                                                                                   +
    -- Get winner details                                                                                                          +
    SELECT                                                                                                                         +
      p.*,                                                                                                                         +
      b.amount as winning_bid                                                                                                      +
    INTO v_winner                                                                                                                  +
    FROM bids b                                                                                                                    +
    JOIN people p ON b.person_id = p.id                                                                                            +
    WHERE b.art_id = p_art_id                                                                                                      +
    ORDER BY b.amount DESC                                                                                                         +
    LIMIT 1;                                                                                                                       +
                                                                                                                                   +
    IF NOT FOUND THEN                                                                                                              +
      RETURN;                                                                                                                      +
    END IF;                                                                                                                        +
                                                                                                                                   +
    -- Get bidding statistics (fixed the window function issue)                                                                    +
    WITH bid_stats AS (                                                                                                            +
      SELECT                                                                                                                       +
        amount,                                                                                                                    +
        created_at,                                                                                                                +
        LAG(amount) OVER (ORDER BY created_at) as prev_amount                                                                      +
      FROM bids                                                                                                                    +
      WHERE art_id = p_art_id                                                                                                      +
    )                                                                                                                              +
    SELECT                                                                                                                         +
      COUNT(*) as total_bids,                                                                                                      +
      AVG(amount - prev_amount) FILTER (WHERE prev_amount IS NOT NULL) as avg_increment,                                           +
      EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at)))/60 as duration_minutes                                               +
    INTO v_stats                                                                                                                   +
    FROM bid_stats;                                                                                                                +
                                                                                                                                   +
    -- Calculate total with tax                                                                                                    +
    v_total_with_tax := v_winner.winning_bid * (1 + COALESCE(v_art.tax, 0) / 100.0);                                               +
                                                                                                                                   +
    -- Get Slack channel                                                                                                           +
    SELECT resolve_slack_channel(COALESCE(es.channel_name, es.channel_id))                                                         +
    INTO v_channel_id                                                                                                              +
    FROM event_slack_settings es                                                                                                   +
    WHERE es.event_id = v_art.event_id;                                                                                            +
                                                                                                                                   +
    IF v_channel_id IS NULL THEN                                                                                                   +
      RETURN;                                                                                                                      +
    END IF;                                                                                                                        +
                                                                                                                                   +
    -- Build Slack notification data                                                                                               +
    v_slack_data := jsonb_build_object(                                                                                            +
      'channel', v_channel_id,                                                                                                     +
      'blocks', jsonb_build_array(                                                                                                 +
        jsonb_build_object(                                                                                                        +
          'type', 'header',                                                                                                        +
          'text', jsonb_build_object(                                                                                              +
            'type', 'plain_text',                                                                                                  +
            'text', format('🎉 Auction Won: %s', v_art.art_code)                                                                    +
          )                                                                                                                        +
        ),                                                                                                                         +
        jsonb_build_object(                                                                                                        +
          'type', 'section',                                                                                                       +
          'fields', jsonb_build_array(                                                                                             +
            jsonb_build_object(                                                                                                    +
              'type', 'mrkdwn',                                                                                                    +
              'text', format('*Artist:*\n%s', COALESCE(v_art.artist_name, 'Unknown'))                                              +
            ),                                                                                                                     +
            jsonb_build_object(                                                                                                    +
              'type', 'mrkdwn',                                                                                                    +
              'text', format('*Winner:*\n%s', mask_name(v_winner.nickname))                                                        +
            ),                                                                                                                     +
            jsonb_build_object(                                                                                                    +
              'type', 'mrkdwn',                                                                                                    +
              'text', format('*Winning Bid:*\n%s%s', COALESCE(v_art.currency, '$'), v_winner.winning_bid)                          +
            ),                                                                                                                     +
            jsonb_build_object(                                                                                                    +
              'type', 'mrkdwn',                                                                                                    +
              'text', format('*Round/Easel:*\n%s/%s', v_art.round, v_art.easel)                                                    +
            )                                                                                                                      +
          )                                                                                                                        +
        ),                                                                                                                         +
        jsonb_build_object(                                                                                                        +
          'type', 'section',                                                                                                       +
          'text', jsonb_build_object(                                                                                              +
            'type', 'mrkdwn',                                                                                                      +
            'text', format(E':credit_card: *Payment Required*\nTotal with tax (%s%%): *%s%s*\nPayment link sent to winner via SMS',+
              COALESCE(v_art.tax, 0),                                                                                              +
              COALESCE(v_art.currency, '$'),                                                                                       +
              round(v_total_with_tax, 2)                                                                                           +
            )                                                                                                                      +
          )                                                                                                                        +
        ),                                                                                                                         +
        jsonb_build_object(                                                                                                        +
          'type', 'context',                                                                                                       +
          'elements', jsonb_build_array(                                                                                           +
            jsonb_build_object(                                                                                                    +
              'type', 'mrkdwn',                                                                                                    +
              'text', format('Total bids: %s | Avg increment: %s%s | Duration: %s min',                                            +
                v_stats.total_bids,                                                                                                +
                COALESCE(v_art.currency, '$'),                                                                                     +
                COALESCE(round(v_stats.avg_increment, 2)::text, 'N/A'),                                                            +
                round(v_stats.duration_minutes)                                                                                    +
              )                                                                                                                    +
            )                                                                                                                      +
          )                                                                                                                        +
        )                                                                                                                          +
      )                                                                                                                            +
    );                                                                                                                             +
                                                                                                                                   +
    -- Queue Slack notification                                                                                                    +
    INSERT INTO slack_notifications (                                                                                              +
      event_id,                                                                                                                    +
      channel_id,                                                                                                                  +
      notification_type,                                                                                                           +
      data,                                                                                                                        +
      status                                                                                                                       +
    ) VALUES (                                                                                                                     +
      v_art.event_id,                                                                                                              +
      v_channel_id,                                                                                                                +
      'auction_won',                                                                                                               +
      v_slack_data,                                                                                                                +
      'pending'                                                                                                                    +
    );                                                                                                                             +
                                                                                                                                   +
  EXCEPTION                                                                                                                        +
    WHEN OTHERS THEN                                                                                                               +
      RAISE WARNING 'Error in send_rich_winner_notification: %', SQLERRM;                                                          +
  END;                                                                                                                             +
  $function$                                                                                                                       +
 
 CREATE OR REPLACE FUNCTION public.send_rich_winner_notification(p_event_id uuid, p_art_id uuid)                                   +
  RETURNS void                                                                                                                     +
  LANGUAGE plpgsql                                                                                                                 +
  SECURITY DEFINER                                                                                                                 +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                                                  +
 AS $function$                                                                                                                     +
  DECLARE                                                                                                                          +
    v_event RECORD;                                                                                                                +
    v_art RECORD;                                                                                                                  +
    v_winner RECORD;                                                                                                               +
    v_channel VARCHAR;                                                                                                             +
  BEGIN                                                                                                                            +
    -- Get event info                                                                                                              +
    SELECT                                                                                                                         +
      e.*,                                                                                                                         +
      es.channel_name,                                                                                                             +
      es.winner_notifications                                                                                                      +
    INTO v_event                                                                                                                   +
    FROM events e                                                                                                                  +
    LEFT JOIN event_slack_settings es ON es.event_id = e.id                                                                        +
    WHERE e.id = p_event_id;                                                                                                       +
                                                                                                                                   +
    -- Only proceed if winner notifications are enabled                                                                            +
    IF NOT COALESCE(v_event.winner_notifications, false) THEN                                                                      +
      RETURN;                                                                                                                      +
    END IF;                                                                                                                        +
                                                                                                                                   +
    -- Determine channel (use friendly names)                                                                                      +
    v_channel := COALESCE(                                                                                                         +
      CASE                                                                                                                         +
        WHEN v_event.channel_name ~ '^[CGD][0-9A-Z]+$' THEN 'general'                                                              +
        ELSE v_event.channel_name                                                                                                  +
      END,                                                                                                                         +
      CASE                                                                                                                         +
        WHEN v_event.slack_channel ~ '^[CGD][0-9A-Z]+$' THEN 'general'                                                             +
        ELSE v_event.slack_channel                                                                                                 +
      END,                                                                                                                         +
      'general'                                                                                                                    +
    );                                                                                                                             +
                                                                                                                                   +
    -- Get art and winner info                                                                                                     +
    SELECT                                                                                                                         +
      a.*,                                                                                                                         +
      ap.name as artist_name,                                                                                                      +
      p.name as winner_name,                                                                                                       +
      (b.amount_cents / 100.0) as winning_amount                                                                                   +
    INTO v_art                                                                                                                     +
    FROM art a                                                                                                                     +
    LEFT JOIN artist_profiles ap ON a.artist_id = ap.id                                                                            +
    LEFT JOIN bids b ON b.art_id = a.id AND b.id = a.winning_bid_id                                                                +
    LEFT JOIN people p ON p.id = b.person_id                                                                                       +
    WHERE a.id = p_art_id;                                                                                                         +
                                                                                                                                   +
    -- Queue winner notification using cache-only approach                                                                         +
    PERFORM queue_notification_with_cache_only(                                                                                    +
      p_event_id,                                                                                                                  +
      v_channel,                                                                                                                   +
      'auction_winner',                                                                                                            +
      jsonb_build_object(                                                                                                          +
        'art_id', p_art_id,                                                                                                        +
        'art_title', v_art.title,                                                                                                  +
        'artist_name', v_art.artist_name,                                                                                          +
        'winner_name', mask_name(v_art.winner_name),                                                                               +
        'winning_amount', v_art.winning_amount,                                                                                    +
        'currency_symbol', v_event.currency_symbol,                                                                                +
        'event_name', v_event.name                                                                                                 +
      )                                                                                                                            +
    );                                                                                                                             +
  END;                                                                                                                             +
  $function$                                                                                                                       +
 
(2 rows)

