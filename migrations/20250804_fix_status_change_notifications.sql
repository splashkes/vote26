-- Create trigger to handle status changes and send notifications

-- First, update the trigger function to handle both 'closed' and 'sold' status
CREATE OR REPLACE FUNCTION trigger_auction_closed_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_winner RECORD;
  v_phone TEXT;
  v_total_with_tax NUMERIC;
  v_payment_url TEXT;
  v_message_id UUID;
  v_event RECORD;
  v_artist_name TEXT;
BEGIN
  -- Only trigger on status change to 'closed' or 'sold' (both mean auction ended)
  IF (NEW.status IN ('closed', 'sold')) AND (OLD.status NOT IN ('closed', 'sold')) THEN
    
    -- Get event and artist info
    SELECT 
      e.name as event_name,
      e.currency,
      e.tax,
      COALESCE(ap.name, 'Artist') as artist_name
    INTO v_event
    FROM events e
    LEFT JOIN artist_profiles ap ON ap.id = NEW.artist_id
    WHERE e.id = NEW.event_id;
    
    v_artist_name := v_event.artist_name;
    
    -- Get the highest bidder
    SELECT 
      b.person_id as id,
      b.amount,
      p.phone_number,
      p.auth_phone,
      p.nickname
    INTO v_winner
    FROM bids b
    JOIN people p ON b.person_id = p.id
    WHERE b.art_id = NEW.id
    ORDER BY b.amount DESC
    LIMIT 1;
    
    IF FOUND THEN
      -- Update winner_id if not already set
      IF NEW.winner_id IS NULL THEN
        UPDATE art SET winner_id = v_winner.id WHERE id = NEW.id;
      END IF;
      
      -- Send winner SMS notification
      v_phone := COALESCE(v_winner.auth_phone, v_winner.phone_number);
      
      IF v_phone IS NOT NULL THEN
        -- Calculate total with tax
        v_total_with_tax := v_winner.amount * (1 + COALESCE(v_event.tax, 0) / 100.0);
        
        -- Generate payment URL
        v_payment_url := format('https://artb.art/pay/%s', NEW.art_code);
        
        -- Send instant SMS
        v_message_id := send_sms_instantly(
          p_destination := v_phone,
          p_message_body := format(
            'Congratulations! You won %s by %s for %s%s (incl tax). Complete payment: %s',
            NEW.art_code,
            v_artist_name,
            COALESCE(v_event.currency, '$'),
            round(v_total_with_tax, 2),
            v_payment_url
          ),
          p_metadata := jsonb_build_object(
            'type', 'auction_winner',
            'art_id', NEW.id,
            'art_code', NEW.art_code,
            'amount', v_winner.amount,
            'total_with_tax', round(v_total_with_tax, 2),
            'winner_id', v_winner.id
          )
        );
        
        RAISE NOTICE 'Sent winner SMS to % for art %', v_phone, NEW.art_code;
      END IF;
      
      -- Also trigger Slack notification
      PERFORM send_rich_winner_notification(NEW.id);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger to ensure it's properly attached
DROP TRIGGER IF EXISTS send_auction_closed_notification ON art;
CREATE TRIGGER send_auction_closed_notification
  AFTER UPDATE ON art
  FOR EACH ROW
  EXECUTE FUNCTION trigger_auction_closed_notification();