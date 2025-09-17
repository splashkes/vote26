                                               pg_get_functiondef                                               
----------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.generate_auction_summary(p_event_id uuid)                                   +
  RETURNS void                                                                                                 +
  LANGUAGE plpgsql                                                                                             +
 AS $function$                                                                                                 +
  DECLARE                                                                                                      +
    v_stats RECORD;                                                                                            +
    v_top_sales TEXT;                                                                                          +
    v_channel_id VARCHAR;                                                                                      +
    v_event RECORD;                                                                                            +
  BEGIN                                                                                                        +
    -- Get event details                                                                                       +
    SELECT * INTO v_event                                                                                      +
    FROM events                                                                                                +
    WHERE id = p_event_id;                                                                                     +
                                                                                                               +
    -- Get auction statistics                                                                                  +
    SELECT                                                                                                     +
      COUNT(*) as total_artworks,                                                                              +
      COUNT(*) FILTER (WHERE status = 'closed' AND current_bid > 0) as sold_count,                             +
      SUM(CASE WHEN status = 'closed' THEN current_bid ELSE 0 END) as total_revenue,                           +
      AVG(current_bid) FILTER (WHERE status = 'closed' AND current_bid > 0) as avg_sale_price                  +
    INTO v_stats                                                                                               +
    FROM art                                                                                                   +
    WHERE event_id = p_event_id;                                                                               +
                                                                                                               +
    -- Get top 3 sales                                                                                         +
    SELECT string_agg(                                                                                         +
      format('%s. %s by %s - %s%s',                                                                            +
        ROW_NUMBER() OVER (ORDER BY current_bid DESC),                                                         +
        art_code,                                                                                              +
        artist_name,                                                                                           +
        currency,                                                                                              +
        current_bid                                                                                            +
      ), E'\n'                                                                                                 +
    ) INTO v_top_sales                                                                                         +
    FROM (                                                                                                     +
      SELECT a.art_code, ap.name as artist_name, a.current_bid, e.currency                                     +
      FROM art a                                                                                               +
      JOIN events e ON a.event_id = e.id                                                                       +
      LEFT JOIN artist_profiles ap ON a.artist_id = ap.id                                                      +
      WHERE a.event_id = p_event_id                                                                            +
        AND a.status = 'closed'                                                                                +
        AND a.current_bid > 0                                                                                  +
      ORDER BY a.current_bid DESC                                                                              +
      LIMIT 3                                                                                                  +
    ) top;                                                                                                     +
                                                                                                               +
    -- Get Slack channel                                                                                       +
    SELECT resolve_slack_channel(COALESCE(es.channel_name, es.channel_id))                                     +
    INTO v_channel_id                                                                                          +
    FROM event_slack_settings es                                                                               +
    WHERE es.event_id = p_event_id;                                                                            +
                                                                                                               +
    IF v_channel_id IS NOT NULL THEN                                                                           +
      INSERT INTO slack_notifications (                                                                        +
        event_id,                                                                                              +
        channel_id,                                                                                            +
        message_type,                                                                                          +
        payload                                                                                                +
      ) VALUES (                                                                                               +
        p_event_id,                                                                                            +
        v_channel_id,                                                                                          +
        'auction_summary',                                                                                     +
        jsonb_build_object(                                                                                    +
          'event_name', v_event.name,                                                                          +
          'event_date', to_char(v_event.start_time, 'YYYY-MM-DD'),                                             +
          'total_artworks', v_stats.total_artworks,                                                            +
          'sold_count', v_stats.sold_count,                                                                    +
          'sold_percentage', ROUND((v_stats.sold_count::numeric / NULLIF(v_stats.total_artworks, 0)) * 100, 1),+
          'currency', COALESCE(v_event.currency, '$'),                                                         +
          'total_revenue', ROUND(v_stats.total_revenue, 2),                                                    +
          'avg_sale_price', ROUND(v_stats.avg_sale_price, 2),                                                  +
          'top_sales', COALESCE(v_top_sales, 'No sales yet')                                                   +
        )                                                                                                      +
      );                                                                                                       +
    END IF;                                                                                                    +
  END;                                                                                                         +
  $function$                                                                                                   +
 
(1 row)

