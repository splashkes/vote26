-- Fix queue_outbid_notification to look for phone in the correct column
CREATE OR REPLACE FUNCTION queue_outbid_notification(
  p_user_mongo_id TEXT, 
  p_person_id UUID, 
  p_art_id TEXT, 
  p_artist_name TEXT, 
  p_amount NUMERIC, 
  p_currency_symbol TEXT, 
  p_outbidder_phone_last4 TEXT,
  p_event_phone_number TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_phone TEXT;
  v_vote_url TEXT;
  v_message TEXT;
  v_message_id UUID;
BEGIN
  -- Get user's phone number - check both phone columns
  SELECT COALESCE(phone_number, phone) INTO v_phone
  FROM people WHERE id = p_person_id;

  IF v_phone IS NULL THEN
    RAISE WARNING 'No phone number found for person ID: %', p_person_id;
    RETURN NULL;
  END IF;

  -- TODO: Get vote URL from registration log
  -- For now, we'll construct a basic URL
  v_vote_url := format('%s/a/%s',
    COALESCE(current_setting('app.site_url', true), 'https://artb.art'),
    p_art_id
  );

  -- Format message matching Node.js format
  v_message := format('OUTBID on %s by %s %s',
    p_art_id || '-' || p_artist_name,
    p_outbidder_phone_last4,
    v_vote_url
  );

  RAISE NOTICE 'Sending outbid SMS to % with message: %', v_phone, v_message;

  -- Use send_sms_instantly to get correct from_phone
  v_message_id := send_sms_instantly(
    p_destination := v_phone,
    p_message_body := v_message,
    p_metadata := jsonb_build_object(
      'type', 'outbid_notification',
      'art_id', p_art_id,
      'user_id', p_user_mongo_id,
      'amount', p_amount
    )
  );

  RETURN v_message_id;
END;
$$;