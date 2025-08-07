-- Fix send_sms_instantly to use hardcoded from phone
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
  v_event_id UUID;
BEGIN
  -- Generate message ID
  v_message_id := gen_random_uuid();
  
  -- Hardcode from phone for now
  v_from_phone := '+18887111857';
  
  -- Insert into message queue
  INSERT INTO message_queue (
    id,
    channel,
    destination,
    message_body,
    metadata,
    status,
    priority,
    send_after,
    send_immediately,
    from_phone,
    created_at
  ) VALUES (
    v_message_id,
    'sms',
    p_destination,
    p_message_body,
    p_metadata,
    'pending',
    1,
    NOW(),
    true,
    v_from_phone,
    NOW()
  );
  
  RETURN v_message_id;
END;
$$;