                                             pg_get_functiondef                                              
-------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.trigger_auction_closed_notification()                                    +
  RETURNS trigger                                                                                           +
  LANGUAGE plpgsql                                                                                          +
  SECURITY DEFINER                                                                                          +
 AS $function$                                                                                              +
 DECLARE                                                                                                    +
   v_winner RECORD;                                                                                         +
   v_phone TEXT;                                                                                            +
   v_total_with_tax NUMERIC;                                                                                +
   v_auction_url TEXT;                                                                                      +
   v_message_id UUID;                                                                                       +
   v_event RECORD;                                                                                          +
   v_artist_name TEXT;                                                                                      +
   v_event_code TEXT;                                                                                       +
 BEGIN                                                                                                      +
   -- Only trigger on status change to 'closed' or 'sold' (both mean auction ended)                         +
   IF (NEW.status IN ('closed', 'sold')) AND (OLD.status NOT IN ('closed', 'sold')) THEN                    +
                                                                                                            +
     -- Get event and artist info                                                                           +
     SELECT                                                                                                 +
       e.name as event_name,                                                                                +
       e.currency,                                                                                          +
       e.tax,                                                                                               +
       COALESCE(ap.name, 'Artist') as artist_name                                                           +
     INTO v_event                                                                                           +
     FROM events e                                                                                          +
     LEFT JOIN artist_profiles ap ON ap.id = NEW.artist_id                                                  +
     WHERE e.id = NEW.event_id;                                                                             +
                                                                                                            +
     v_artist_name := v_event.artist_name;                                                                  +
     -- Extract event code from art_code (e.g., "AB2900-1-1" -> "AB2900")                                   +
     v_event_code := split_part(NEW.art_code, '-', 1);                                                      +
                                                                                                            +
     -- Get the highest bidder                                                                              +
     SELECT                                                                                                 +
       b.person_id as id,                                                                                   +
       b.amount,                                                                                            +
       p.phone_number,                                                                                      +
       p.auth_phone,                                                                                        +
       p.nickname                                                                                           +
     INTO v_winner                                                                                          +
     FROM bids b                                                                                            +
     JOIN people p ON b.person_id = p.id                                                                    +
     WHERE b.art_id = NEW.id                                                                                +
     ORDER BY b.amount DESC                                                                                 +
     LIMIT 1;                                                                                               +
                                                                                                            +
     IF FOUND THEN                                                                                          +
       -- Update winner_id if not already set                                                               +
       IF NEW.winner_id IS NULL THEN                                                                        +
         UPDATE art SET winner_id = v_winner.id WHERE id = NEW.id;                                          +
       END IF;                                                                                              +
                                                                                                            +
       -- Send winner SMS notification                                                                      +
       v_phone := COALESCE(v_winner.auth_phone, v_winner.phone_number);                                     +
                                                                                                            +
       IF v_phone IS NOT NULL THEN                                                                          +
         -- Calculate total with tax                                                                        +
         v_total_with_tax := v_winner.amount * (1 + COALESCE(v_event.tax, 0) / 100.0);                      +
                                                                                                            +
         -- Generate auction URL instead of payment URL for consistency                                     +
         v_auction_url := format('https://artb.art/e/%s/auction', v_event_code);                            +
                                                                                                            +
         -- Send improved SMS instantly                                                                     +
         v_message_id := send_sms_instantly(                                                                +
           p_destination := v_phone,                                                                        +
           p_message_body := format(                                                                        +
             '🎉 Congratulations! You won %s''s artwork for %s%s (tax included). Complete your purchase: %s',+
             v_artist_name,                                                                                 +
             COALESCE(v_event.currency, '$'),                                                               +
             round(v_total_with_tax, 2),                                                                    +
             v_auction_url                                                                                  +
           ),                                                                                               +
           p_metadata := jsonb_build_object(                                                                +
             'type', 'auction_winner',                                                                      +
             'art_id', NEW.id,                                                                              +
             'art_code', NEW.art_code,                                                                      +
             'amount', v_winner.amount,                                                                     +
             'total_with_tax', round(v_total_with_tax, 2),                                                  +
             'winner_id', v_winner.id,                                                                      +
             'event_code', v_event_code,                                                                    +
             'message_version', 'improved_v1'                                                               +
           )                                                                                                +
         );                                                                                                 +
                                                                                                            +
         RAISE NOTICE 'Sent winner SMS to % for art %', v_phone, NEW.art_code;                              +
       END IF;                                                                                              +
                                                                                                            +
       -- Also trigger Slack notification                                                                   +
       PERFORM send_rich_winner_notification(NEW.id);                                                       +
     END IF;                                                                                                +
   END IF;                                                                                                  +
                                                                                                            +
   RETURN NEW;                                                                                              +
 END;                                                                                                       +
 $function$                                                                                                 +
 
(1 row)

