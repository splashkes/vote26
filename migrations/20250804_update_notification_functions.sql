-- Update notification functions to return UUID

CREATE OR REPLACE FUNCTION queue_bid_confirmation(
  p_user_mongo_id TEXT,
  p_person_id UUID,
  p_art_id TEXT,
  p_artist_name TEXT,
  p_amount NUMERIC,
  p_currency_symbol TEXT,
  p_user_data JSONB,
  p_event_phone_number TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_phone TEXT;
  v_nickname TEXT;
  v_hash TEXT;
  v_vote_url TEXT;
  v_message TEXT;
  v_message_id UUID;
BEGIN
  -- Extract user data
  v_phone := p_user_data->>'PhoneNumber';
  v_nickname := p_user_data->>'NickName';
  v_hash := p_user_data->>'Hash';
  
  IF v_phone IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Construct personalized URL
  v_vote_url := format('%s/a/%s/r/%s',
    COALESCE(current_setting('app.site_url', true), 'https://artb.art'),
    p_art_id,
    v_hash
  );
  
  -- Format message
  v_message := format('%s%s Bid recorded on %s by %s %s',
    p_currency_symbol,
    p_amount,
    p_art_id || '-' || p_artist_name,
    v_nickname,
    v_vote_url
  );
  
  -- Send instantly
  v_message_id := send_sms_instantly(
    p_destination := v_phone,
    p_message_body := v_message,
    p_metadata := jsonb_build_object(
      'type', 'bid_confirmation',
      'art_id', p_art_id,
      'user_id', p_user_mongo_id,
      'amount', p_amount,
      'nickname', v_nickname
    ),
    p_from_phone := p_event_phone_number
  );
  
  RETURN v_message_id;
END;
$$ LANGUAGE plpgsql;