-- Fix queue_outbid_notification to check both phone columns
-- The function was only checking phone_number column but data might be in phone column

CREATE OR REPLACE FUNCTION queue_outbid_notification(
  p_user_mongo_id text, 
  p_person_id uuid, 
  p_art_id text, 
  p_artist_name text, 
  p_amount numeric, 
  p_currency_symbol text, 
  p_outbidder_phone_last4 text
)
RETURNS void
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
    RAISE WARNING 'No phone number found for person_id: %', p_person_id;
    RETURN;
  END IF;

  -- Extract event code from art_id (e.g., AB2900 from AB2900-1-5)
  -- Construct auction URL format: https://artb.art/AB2900/auction
  v_vote_url := format('%s/%s/auction',
    COALESCE(current_setting('app.site_url', true), 'https://artb.art'),
    split_part(p_art_id, '-', 1)
  );

  -- Format message with current bid amount and rebid URL
  v_message := format('OUTBID on %s-%s by %s - bid is at %s%s, rebid @ %s',
    p_art_id,
    p_artist_name,
    right(p_outbidder_phone_last4, 4),
    p_currency_symbol,
    p_amount,
    v_vote_url
  );

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

  RAISE NOTICE 'Outbid notification sent to % with message ID %', v_phone, v_message_id;
END;
$$;