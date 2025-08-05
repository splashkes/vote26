-- Enhanced rich Slack notifications for auction events

-- Update format_slack_message to include rich auction winner notifications
CREATE OR REPLACE FUNCTION format_slack_message(
  p_type VARCHAR,
  p_payload JSONB
) RETURNS JSONB AS $$
BEGIN
  CASE p_type
    WHEN 'auction_winner_rich' THEN
      RETURN jsonb_build_array(
        -- Header with celebration
        jsonb_build_object(
          'type', 'header',
          'text', jsonb_build_object(
            'type', 'plain_text',
            'text', E'🎉 Auction Winner! 🎉',
            'emoji', true
          )
        ),
        -- Artwork and winner details
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', format(E'*Artwork:* %s\n*Artist:* %s\n*Final Bid:* %s%s\n*Winner:* %s (%s)',
              p_payload->>'art_code',
              p_payload->>'artist_name',
              p_payload->>'currency',
              p_payload->>'final_bid',
              p_payload->>'winner_name',
              p_payload->>'winner_phone'
            )
          ),
          'accessory', CASE 
            WHEN p_payload->>'artwork_image' IS NOT NULL THEN
              jsonb_build_object(
                'type', 'image',
                'image_url', p_payload->>'artwork_image',
                'alt_text', format('Artwork %s', p_payload->>'art_code')
              )
            ELSE NULL
          END
        ),
        -- Bidding summary
        jsonb_build_object(
          'type', 'section',
          'fields', jsonb_build_array(
            jsonb_build_object(
              'type', 'mrkdwn',
              'text', format('*Total Bids:*\n%s', p_payload->>'total_bids')
            ),
            jsonb_build_object(
              'type', 'mrkdwn', 
              'text', format('*Bid Increment:*\n%s%s', p_payload->>'currency', p_payload->>'avg_increment')
            ),
            jsonb_build_object(
              'type', 'mrkdwn',
              'text', format('*Duration:*\n%s', p_payload->>'auction_duration')
            ),
            jsonb_build_object(
              'type', 'mrkdwn',
              'text', format('*Extensions:*\n%s', COALESCE(p_payload->>'extension_count', '0'))
            )
          )
        ),
        -- Payment details
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', format(E':credit_card: *Payment Required*\nTotal with tax (%s%%): *%s%s*\nPayment link sent to winner via SMS',
              p_payload->>'tax_percent',
              p_payload->>'currency',
              p_payload->>'total_with_tax'
            )
          )
        ),
        -- Divider
        jsonb_build_object('type', 'divider'),
        -- Context footer
        jsonb_build_object(
          'type', 'context',
          'elements', jsonb_build_array(
            jsonb_build_object(
              'type', 'mrkdwn',
              'text', format('Event: %s | Round %s, Easel %s | %s',
                p_payload->>'event_name',
                p_payload->>'round',
                p_payload->>'easel',
                p_payload->>'timestamp'
              )
            )
          )
        )
      );
      
    WHEN 'auction_summary' THEN
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'header',
          'text', jsonb_build_object(
            'type', 'plain_text',
            'text', E'📊 Auction Summary Report',
            'emoji', true
          )
        ),
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', format('*Event:* %s\n*Date:* %s',
              p_payload->>'event_name',
              p_payload->>'event_date'
            )
          )
        ),
        jsonb_build_object(
          'type', 'section',
          'fields', jsonb_build_array(
            jsonb_build_object(
              'type', 'mrkdwn',
              'text', format('*Total Artworks:*\n%s', p_payload->>'total_artworks')
            ),
            jsonb_build_object(
              'type', 'mrkdwn',
              'text', format('*Sold:*\n%s (%s%%)', 
                p_payload->>'sold_count',
                p_payload->>'sold_percentage'
              )
            ),
            jsonb_build_object(
              'type', 'mrkdwn',
              'text', format('*Total Revenue:*\n%s%s', 
                p_payload->>'currency',
                p_payload->>'total_revenue'
              )
            ),
            jsonb_build_object(
              'type', 'mrkdwn',
              'text', format('*Avg Sale Price:*\n%s%s',
                p_payload->>'currency',
                p_payload->>'avg_sale_price'
              )
            )
          )
        ),
        -- Top sales
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', format(E'*🏆 Top Sales:*\n%s', p_payload->>'top_sales')
          )
        )
      );
      
    -- Keep all other existing cases...
    WHEN 'auction_extended' THEN
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', format(E':alarm_clock: *Auction Extended!*\nLate bid triggered a 5-minute extension\nNew closing time: %s (%s)\nExtension #%s',
              to_char((p_payload->>'new_closing')::timestamptz, 'HH24:MI:SS'),
              p_payload->>'time_zone',
              p_payload->>'extension_number'
            )
          )
        )
      );
      
    WHEN 'auction_closed' THEN
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', format(E':hammer: *Auction Closed - SOLD!*\nArtwork: %s by %s\nFinal bid: $%s\nWinner: %s (***-%s)\nTotal bids: %s',
              p_payload->>'art_code',
              p_payload->>'artist_name',
              p_payload->>'final_bid',
              p_payload->>'winner_name',
              p_payload->>'winner_phone',
              p_payload->>'total_bids'
            )
          )
        )
      );
      
    WHEN 'auction_closed_no_bids' THEN
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', format(E':warning: *No Bids - Auction Closed*\nArtwork: %s by %s\nStarting bid was %s\nNo bids were placed on this artwork.',
              p_payload->>'art_code',
              p_payload->>'artist_name',
              p_payload->>'starting_bid'
            )
          )
        )
      );
      
    ELSE
      -- Return existing default or other message types
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', COALESCE(p_payload->>'message', 'Art Battle Notification')
          )
        )
      );
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- Enhanced function to send rich winner notification
CREATE OR REPLACE FUNCTION send_rich_winner_notification(
  p_art_id UUID
) RETURNS VOID AS $$
DECLARE
  v_art RECORD;
  v_winner RECORD;
  v_bid_stats RECORD;
  v_channel_id VARCHAR;
  v_artwork_image TEXT;
BEGIN
  -- Get art and winner details
  SELECT 
    a.*,
    e.name as event_name,
    e.currency,
    e.tax,
    ap.name as artist_name
  INTO v_art
  FROM art a
  JOIN events e ON a.event_id = e.id
  LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
  WHERE a.id = p_art_id;
  
  -- Get winner details
  SELECT * INTO v_winner
  FROM people
  WHERE id = v_art.winner_id;
  
  -- Get bidding statistics
  SELECT 
    COUNT(*) as total_bids,
    AVG(amount - LAG(amount) OVER (ORDER BY created_at)) as avg_increment,
    EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at)))/60 as duration_minutes
  INTO v_bid_stats
  FROM bids
  WHERE art_id = p_art_id;
  
  -- Try to get artwork image URL (if media table exists)
  BEGIN
    SELECT url INTO v_artwork_image
    FROM media
    WHERE art_id = p_art_id
      AND type = 'image'
    ORDER BY created_at DESC
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_artwork_image := NULL;
  END;
  
  -- Get Slack channel
  SELECT resolve_slack_channel(COALESCE(es.channel_name, es.channel_id))
  INTO v_channel_id
  FROM event_slack_settings es
  WHERE es.event_id = v_art.event_id;
  
  IF v_channel_id IS NOT NULL THEN
    INSERT INTO slack_notifications (
      event_id,
      channel_id,
      message_type,
      payload
    ) VALUES (
      v_art.event_id,
      v_channel_id,
      'auction_winner_rich',
      jsonb_build_object(
        'art_code', v_art.art_code,
        'artist_name', v_art.artist_name,
        'currency', COALESCE(v_art.currency, '$'),
        'final_bid', v_art.current_bid,
        'winner_name', v_winner.nickname,
        'winner_phone', '***-' || RIGHT(v_winner.phone_number, 4),
        'total_bids', v_bid_stats.total_bids,
        'avg_increment', ROUND(v_bid_stats.avg_increment, 2),
        'auction_duration', CASE 
          WHEN v_bid_stats.duration_minutes < 60 THEN 
            ROUND(v_bid_stats.duration_minutes) || ' min'
          ELSE 
            ROUND(v_bid_stats.duration_minutes / 60, 1) || ' hours'
        END,
        'extension_count', v_art.extension_count,
        'tax_percent', v_art.tax,
        'total_with_tax', ROUND(v_art.current_bid * (1 + COALESCE(v_art.tax, 0) / 100), 2),
        'event_name', v_art.event_name,
        'round', v_art.round,
        'easel', v_art.easel,
        'timestamp', to_char(NOW(), 'YYYY-MM-DD HH24:MI TZ'),
        'artwork_image', v_artwork_image
      )
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger to send rich notification when auction closes
CREATE OR REPLACE FUNCTION trigger_auction_closed_notification()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger on status change to 'closed' with a winner
  IF NEW.status = 'closed' AND OLD.status != 'closed' AND NEW.winner_id IS NOT NULL THEN
    PERFORM send_rich_winner_notification(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'send_auction_closed_notification'
  ) THEN
    CREATE TRIGGER send_auction_closed_notification
    AFTER UPDATE ON art
    FOR EACH ROW
    EXECUTE FUNCTION trigger_auction_closed_notification();
  END IF;
END $$;

-- Function to generate event auction summary
CREATE OR REPLACE FUNCTION generate_auction_summary(
  p_event_id UUID
) RETURNS VOID AS $$
DECLARE
  v_stats RECORD;
  v_top_sales TEXT;
  v_channel_id VARCHAR;
  v_event RECORD;
BEGIN
  -- Get event details
  SELECT * INTO v_event
  FROM events
  WHERE id = p_event_id;
  
  -- Get auction statistics
  SELECT 
    COUNT(*) as total_artworks,
    COUNT(*) FILTER (WHERE status = 'closed' AND current_bid > 0) as sold_count,
    SUM(CASE WHEN status = 'closed' THEN current_bid ELSE 0 END) as total_revenue,
    AVG(current_bid) FILTER (WHERE status = 'closed' AND current_bid > 0) as avg_sale_price
  INTO v_stats
  FROM art
  WHERE event_id = p_event_id;
  
  -- Get top 3 sales
  SELECT string_agg(
    format('%s. %s by %s - %s%s', 
      ROW_NUMBER() OVER (ORDER BY current_bid DESC),
      art_code,
      artist_name,
      currency,
      current_bid
    ), E'\n'
  ) INTO v_top_sales
  FROM (
    SELECT a.art_code, ap.name as artist_name, a.current_bid, e.currency
    FROM art a
    JOIN events e ON a.event_id = e.id
    LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
    WHERE a.event_id = p_event_id
      AND a.status = 'closed'
      AND a.current_bid > 0
    ORDER BY a.current_bid DESC
    LIMIT 3
  ) top;
  
  -- Get Slack channel
  SELECT resolve_slack_channel(COALESCE(es.channel_name, es.channel_id))
  INTO v_channel_id
  FROM event_slack_settings es
  WHERE es.event_id = p_event_id;
  
  IF v_channel_id IS NOT NULL THEN
    INSERT INTO slack_notifications (
      event_id,
      channel_id,
      message_type,
      payload
    ) VALUES (
      p_event_id,
      v_channel_id,
      'auction_summary',
      jsonb_build_object(
        'event_name', v_event.name,
        'event_date', to_char(v_event.start_time, 'YYYY-MM-DD'),
        'total_artworks', v_stats.total_artworks,
        'sold_count', v_stats.sold_count,
        'sold_percentage', ROUND((v_stats.sold_count::numeric / NULLIF(v_stats.total_artworks, 0)) * 100, 1),
        'currency', COALESCE(v_event.currency, '$'),
        'total_revenue', ROUND(v_stats.total_revenue, 2),
        'avg_sale_price', ROUND(v_stats.avg_sale_price, 2),
        'top_sales', COALESCE(v_top_sales, 'No sales yet')
      )
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION send_rich_winner_notification(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_auction_summary(UUID) TO authenticated;