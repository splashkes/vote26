-- Fix send_sms_instantly to handle art_id instead of assuming event_id is UUID
CREATE OR REPLACE FUNCTION send_sms_instantly(
  p_destination TEXT,
  p_message_body TEXT,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message_id UUID;
  v_from_phone TEXT;
  v_event_code TEXT;
  v_event_id UUID;
  v_hardcoded_fallback TEXT := '+18887111857';
BEGIN
  -- Generate message ID
  v_message_id := gen_random_uuid();
  
  -- Try to get event code from art_id in metadata
  v_event_code := split_part(p_metadata->>'art_id', '-', 1);
  
  -- Look up actual event UUID from event code (stored in eid field)
  IF v_event_code IS NOT NULL AND v_event_code != '' THEN
    SELECT id, phone_number INTO v_event_id, v_from_phone
    FROM events
    WHERE eid = v_event_code;
  END IF;
  
  -- Fallback to hardcoded if no event phone or if event phone is same as destination
  IF v_from_phone IS NULL OR v_from_phone = '' OR v_from_phone = p_destination THEN
    v_from_phone := v_hardcoded_fallback;
  END IF;
  
  -- Insert into message queue for immediate sending
  INSERT INTO message_queue (
    id,
    channel,
    destination,
    message_body,
    metadata,
    send_immediately,
    from_phone,
    priority
  ) VALUES (
    v_message_id,
    'sms',
    p_destination,
    p_message_body,
    p_metadata || jsonb_build_object('event_id', v_event_id),
    true,
    v_from_phone,
    1
  );
  
  RETURN v_message_id;
END;
$$;