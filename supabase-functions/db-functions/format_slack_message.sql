                                                                  pg_get_functiondef                                                                  
------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.format_slack_message(p_type character varying, p_payload jsonb)                                                   +
  RETURNS jsonb                                                                                                                                      +
  LANGUAGE plpgsql                                                                                                                                   +
 AS $function$                                                                                                                                       +
  BEGIN                                                                                                                                              +
    CASE p_type                                                                                                                                      +
      WHEN 'auction_winner_rich' THEN                                                                                                                +
        RETURN jsonb_build_array(                                                                                                                    +
          -- Header with celebration                                                                                                                 +
          jsonb_build_object(                                                                                                                        +
            'type', 'header',                                                                                                                        +
            'text', jsonb_build_object(                                                                                                              +
              'type', 'plain_text',                                                                                                                  +
              'text', E'🎉 Auction Winner! 🎉',                                                                                                        +
              'emoji', true                                                                                                                          +
            )                                                                                                                                        +
          ),                                                                                                                                         +
          -- Artwork and winner details                                                                                                              +
          jsonb_build_object(                                                                                                                        +
            'type', 'section',                                                                                                                       +
            'text', jsonb_build_object(                                                                                                              +
              'type', 'mrkdwn',                                                                                                                      +
              'text', format(E'*Artwork:* %s\n*Artist:* %s\n*Final Bid:* %s%s\n*Winner:* %s (%s)',                                                   +
                p_payload->>'art_code',                                                                                                              +
                p_payload->>'artist_name',                                                                                                           +
                p_payload->>'currency',                                                                                                              +
                p_payload->>'final_bid',                                                                                                             +
                p_payload->>'winner_name',                                                                                                           +
                p_payload->>'winner_phone'                                                                                                           +
              )                                                                                                                                      +
            ),                                                                                                                                       +
            'accessory', CASE                                                                                                                        +
              WHEN p_payload->>'artwork_image' IS NOT NULL THEN                                                                                      +
                jsonb_build_object(                                                                                                                  +
                  'type', 'image',                                                                                                                   +
                  'image_url', p_payload->>'artwork_image',                                                                                          +
                  'alt_text', format('Artwork %s', p_payload->>'art_code')                                                                           +
                )                                                                                                                                    +
              ELSE NULL                                                                                                                              +
            END                                                                                                                                      +
          ),                                                                                                                                         +
          -- Bidding summary                                                                                                                         +
          jsonb_build_object(                                                                                                                        +
            'type', 'section',                                                                                                                       +
            'fields', jsonb_build_array(                                                                                                             +
              jsonb_build_object(                                                                                                                    +
                'type', 'mrkdwn',                                                                                                                    +
                'text', format('*Total Bids:*\n%s', p_payload->>'total_bids')                                                                        +
              ),                                                                                                                                     +
              jsonb_build_object(                                                                                                                    +
                'type', 'mrkdwn',                                                                                                                    +
                'text', format('*Bid Increment:*\n%s%s', p_payload->>'currency', p_payload->>'avg_increment')                                        +
              ),                                                                                                                                     +
              jsonb_build_object(                                                                                                                    +
                'type', 'mrkdwn',                                                                                                                    +
                'text', format('*Duration:*\n%s', p_payload->>'auction_duration')                                                                    +
              ),                                                                                                                                     +
              jsonb_build_object(                                                                                                                    +
                'type', 'mrkdwn',                                                                                                                    +
                'text', format('*Extensions:*\n%s', COALESCE(p_payload->>'extension_count', '0'))                                                    +
              )                                                                                                                                      +
            )                                                                                                                                        +
          ),                                                                                                                                         +
          -- Payment details                                                                                                                         +
          jsonb_build_object(                                                                                                                        +
            'type', 'section',                                                                                                                       +
            'text', jsonb_build_object(                                                                                                              +
              'type', 'mrkdwn',                                                                                                                      +
              'text', format(E':credit_card: *Payment Required*\nTotal with tax (%s%%): *%s%s*\nPayment link sent to winner via SMS',                +
                p_payload->>'tax_percent',                                                                                                           +
                p_payload->>'currency',                                                                                                              +
                p_payload->>'total_with_tax'                                                                                                         +
              )                                                                                                                                      +
            )                                                                                                                                        +
          ),                                                                                                                                         +
          -- Divider                                                                                                                                 +
          jsonb_build_object('type', 'divider'),                                                                                                     +
          -- Context footer                                                                                                                          +
          jsonb_build_object(                                                                                                                        +
            'type', 'context',                                                                                                                       +
            'elements', jsonb_build_array(                                                                                                           +
              jsonb_build_object(                                                                                                                    +
                'type', 'mrkdwn',                                                                                                                    +
                'text', format('Event: %s | Round %s, Easel %s | %s',                                                                                +
                  p_payload->>'event_name',                                                                                                          +
                  p_payload->>'round',                                                                                                               +
                  p_payload->>'easel',                                                                                                               +
                  p_payload->>'timestamp'                                                                                                            +
                )                                                                                                                                    +
              )                                                                                                                                      +
            )                                                                                                                                        +
          )                                                                                                                                          +
        );                                                                                                                                           +
                                                                                                                                                     +
      WHEN 'auction_summary' THEN                                                                                                                    +
        RETURN jsonb_build_array(                                                                                                                    +
          jsonb_build_object(                                                                                                                        +
            'type', 'header',                                                                                                                        +
            'text', jsonb_build_object(                                                                                                              +
              'type', 'plain_text',                                                                                                                  +
              'text', E'📊 Auction Summary Report',                                                                                                   +
              'emoji', true                                                                                                                          +
            )                                                                                                                                        +
          ),                                                                                                                                         +
          jsonb_build_object(                                                                                                                        +
            'type', 'section',                                                                                                                       +
            'text', jsonb_build_object(                                                                                                              +
              'type', 'mrkdwn',                                                                                                                      +
              'text', format('*Event:* %s\n*Date:* %s',                                                                                              +
                p_payload->>'event_name',                                                                                                            +
                p_payload->>'event_date'                                                                                                             +
              )                                                                                                                                      +
            )                                                                                                                                        +
          ),                                                                                                                                         +
          jsonb_build_object(                                                                                                                        +
            'type', 'section',                                                                                                                       +
            'fields', jsonb_build_array(                                                                                                             +
              jsonb_build_object(                                                                                                                    +
                'type', 'mrkdwn',                                                                                                                    +
                'text', format('*Total Artworks:*\n%s', p_payload->>'total_artworks')                                                                +
              ),                                                                                                                                     +
              jsonb_build_object(                                                                                                                    +
                'type', 'mrkdwn',                                                                                                                    +
                'text', format('*Sold:*\n%s (%s%%)',                                                                                                 +
                  p_payload->>'sold_count',                                                                                                          +
                  p_payload->>'sold_percentage'                                                                                                      +
                )                                                                                                                                    +
              ),                                                                                                                                     +
              jsonb_build_object(                                                                                                                    +
                'type', 'mrkdwn',                                                                                                                    +
                'text', format('*Total Revenue:*\n%s%s',                                                                                             +
                  p_payload->>'currency',                                                                                                            +
                  p_payload->>'total_revenue'                                                                                                        +
                )                                                                                                                                    +
              ),                                                                                                                                     +
              jsonb_build_object(                                                                                                                    +
                'type', 'mrkdwn',                                                                                                                    +
                'text', format('*Avg Sale Price:*\n%s%s',                                                                                            +
                  p_payload->>'currency',                                                                                                            +
                  p_payload->>'avg_sale_price'                                                                                                       +
                )                                                                                                                                    +
              )                                                                                                                                      +
            )                                                                                                                                        +
          ),                                                                                                                                         +
          -- Top sales                                                                                                                               +
          jsonb_build_object(                                                                                                                        +
            'type', 'section',                                                                                                                       +
            'text', jsonb_build_object(                                                                                                              +
              'type', 'mrkdwn',                                                                                                                      +
              'text', format(E'*🏆 Top Sales:*\n%s', p_payload->>'top_sales')                                                                         +
            )                                                                                                                                        +
          )                                                                                                                                          +
        );                                                                                                                                           +
                                                                                                                                                     +
      WHEN 'auction_extended' THEN                                                                                                                   +
        RETURN jsonb_build_array(                                                                                                                    +
          jsonb_build_object(                                                                                                                        +
            'type', 'section',                                                                                                                       +
            'text', jsonb_build_object(                                                                                                              +
              'type', 'mrkdwn',                                                                                                                      +
              'text', format(E':alarm_clock: *Auction Extended!*\nLate bid triggered a 5-minute extension\nNew closing time: %s (%s)\nExtension #%s',+
                to_char((p_payload->>'new_closing')::timestamptz, 'HH24:MI:SS'),                                                                     +
                p_payload->>'time_zone',                                                                                                             +
                p_payload->>'extension_number'                                                                                                       +
              )                                                                                                                                      +
            )                                                                                                                                        +
          )                                                                                                                                          +
        );                                                                                                                                           +
                                                                                                                                                     +
      WHEN 'auction_closed' THEN                                                                                                                     +
        RETURN jsonb_build_array(                                                                                                                    +
          jsonb_build_object(                                                                                                                        +
            'type', 'section',                                                                                                                       +
            'text', jsonb_build_object(                                                                                                              +
              'type', 'mrkdwn',                                                                                                                      +
              'text', format(E':hammer: *Auction Closed - SOLD!*\nArtwork: %s by %s\nFinal bid: $%s\nWinner: %s (***-%s)\nTotal bids: %s',           +
                p_payload->>'art_code',                                                                                                              +
                p_payload->>'artist_name',                                                                                                           +
                p_payload->>'final_bid',                                                                                                             +
                p_payload->>'winner_name',                                                                                                           +
                p_payload->>'winner_phone',                                                                                                          +
                p_payload->>'total_bids'                                                                                                             +
              )                                                                                                                                      +
            )                                                                                                                                        +
          )                                                                                                                                          +
        );                                                                                                                                           +
                                                                                                                                                     +
      WHEN 'auction_closed_no_bids' THEN                                                                                                             +
        RETURN jsonb_build_array(                                                                                                                    +
          jsonb_build_object(                                                                                                                        +
            'type', 'section',                                                                                                                       +
            'text', jsonb_build_object(                                                                                                              +
              'type', 'mrkdwn',                                                                                                                      +
              'text', format(E':warning: *No Bids - Auction Closed*\nArtwork: %s by %s\nStarting bid was %s\nNo bids were placed on this artwork.',  +
                p_payload->>'art_code',                                                                                                              +
                p_payload->>'artist_name',                                                                                                           +
                p_payload->>'starting_bid'                                                                                                           +
              )                                                                                                                                      +
            )                                                                                                                                        +
          )                                                                                                                                          +
        );                                                                                                                                           +
                                                                                                                                                     +
      ELSE                                                                                                                                           +
        -- Return existing default or other message types                                                                                            +
        RETURN jsonb_build_array(                                                                                                                    +
          jsonb_build_object(                                                                                                                        +
            'type', 'section',                                                                                                                       +
            'text', jsonb_build_object(                                                                                                              +
              'type', 'mrkdwn',                                                                                                                      +
              'text', COALESCE(p_payload->>'message', 'Art Battle Notification')                                                                     +
            )                                                                                                                                        +
          )                                                                                                                                          +
        );                                                                                                                                           +
    END CASE;                                                                                                                                        +
  END;                                                                                                                                               +
  $function$                                                                                                                                         +
 
(1 row)

