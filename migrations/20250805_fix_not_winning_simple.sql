-- Fix to add NOT WINNING notifications when auctions close

-- First, let's create a helper function to send not-winning notifications
CREATE OR REPLACE FUNCTION send_not_winning_notifications(
  p_art_id UUID,
  p_winner_id UUID,
  p_winning_amount NUMERIC,
  p_art_code TEXT,
  p_artist_name TEXT,
  p_currency TEXT,
  p_closed_by TEXT
) RETURNS INTEGER AS $$
DECLARE
  v_bidder RECORD;
  v_notifications_sent INTEGER := 0;
BEGIN
  -- Send NOT WINNING notifications to all other bidders on this artwork
  FOR v_bidder IN
    SELECT DISTINCT 
      p.id,
      p.nickname,
      COALESCE(p.auth_phone, p.phone_number) as phone,
      MAX(b.amount) as highest_bid
    FROM bids b
    JOIN people p ON b.person_id = p.id
    WHERE b.art_id = p_art_id
      AND p.id != p_winner_id  -- Exclude the winner
    GROUP BY p.id, p.nickname, p.auth_phone, p.phone_number
  LOOP
    IF v_bidder.phone IS NOT NULL THEN
      PERFORM send_sms_instantly(
        p_destination := v_bidder.phone,
        p_message_body := format(
          'NOT WINNING - %s by %s. Your highest bid: %s%s. Winner bid: %s%s',
          p_art_code,
          p_artist_name,
          p_currency,
          v_bidder.highest_bid,
          p_currency,
          p_winning_amount
        ),
        p_metadata := jsonb_build_object(
          'type', 'auction_not_winning',
          'art_id', p_art_id,
          'art_code', p_art_code,
          'bidder_id', v_bidder.id,
          'highest_bid', v_bidder.highest_bid,
          'winning_bid', p_winning_amount,
          'closed_by', p_closed_by
        )
      );
      
      v_notifications_sent := v_notifications_sent + 1;
    END IF;
  END LOOP;
  
  RETURN v_notifications_sent;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION send_not_winning_notifications TO authenticated;