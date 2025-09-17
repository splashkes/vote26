                                                                                         pg_get_functiondef                                                                                          
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.send_not_winning_notifications(p_art_id uuid, p_winner_id uuid, p_winning_amount numeric, p_art_code text, p_artist_name text, p_currency text, p_closed_by text)+
  RETURNS integer                                                                                                                                                                                   +
  LANGUAGE plpgsql                                                                                                                                                                                  +
 AS $function$                                                                                                                                                                                      +
  DECLARE                                                                                                                                                                                           +
    v_bidder RECORD;                                                                                                                                                                                +
    v_notifications_sent INTEGER := 0;                                                                                                                                                              +
  BEGIN                                                                                                                                                                                             +
    -- Send NOT WINNING notifications to all other bidders on this artwork                                                                                                                          +
    FOR v_bidder IN                                                                                                                                                                                 +
      SELECT DISTINCT                                                                                                                                                                               +
        p.id,                                                                                                                                                                                       +
        p.nickname,                                                                                                                                                                                 +
        COALESCE(p.auth_phone, p.phone_number) as phone,                                                                                                                                            +
        MAX(b.amount) as highest_bid                                                                                                                                                                +
      FROM bids b                                                                                                                                                                                   +
      JOIN people p ON b.person_id = p.id                                                                                                                                                           +
      WHERE b.art_id = p_art_id                                                                                                                                                                     +
        AND p.id != p_winner_id  -- Exclude the winner                                                                                                                                              +
      GROUP BY p.id, p.nickname, p.auth_phone, p.phone_number                                                                                                                                       +
    LOOP                                                                                                                                                                                            +
      IF v_bidder.phone IS NOT NULL THEN                                                                                                                                                            +
        PERFORM send_sms_instantly(                                                                                                                                                                 +
          p_destination := v_bidder.phone,                                                                                                                                                          +
          p_message_body := format(                                                                                                                                                                 +
            'NOT WINNING - %s by %s. Your highest bid: %s%s. Winner bid: %s%s',                                                                                                                     +
            p_art_code,                                                                                                                                                                             +
            p_artist_name,                                                                                                                                                                          +
            p_currency,                                                                                                                                                                             +
            v_bidder.highest_bid,                                                                                                                                                                   +
            p_currency,                                                                                                                                                                             +
            p_winning_amount                                                                                                                                                                        +
          ),                                                                                                                                                                                        +
          p_metadata := jsonb_build_object(                                                                                                                                                         +
            'type', 'auction_not_winning',                                                                                                                                                          +
            'art_id', p_art_id,                                                                                                                                                                     +
            'art_code', p_art_code,                                                                                                                                                                 +
            'bidder_id', v_bidder.id,                                                                                                                                                               +
            'highest_bid', v_bidder.highest_bid,                                                                                                                                                    +
            'winning_bid', p_winning_amount,                                                                                                                                                        +
            'closed_by', p_closed_by                                                                                                                                                                +
          )                                                                                                                                                                                         +
        );                                                                                                                                                                                          +
                                                                                                                                                                                                    +
        v_notifications_sent := v_notifications_sent + 1;                                                                                                                                           +
      END IF;                                                                                                                                                                                       +
    END LOOP;                                                                                                                                                                                       +
                                                                                                                                                                                                    +
    RETURN v_notifications_sent;                                                                                                                                                                    +
  END;                                                                                                                                                                                              +
  $function$                                                                                                                                                                                        +
 
(1 row)

