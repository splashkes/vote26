-- Test SMS system setup

-- Function to test SMS sending
CREATE OR REPLACE FUNCTION test_sms_send(
  p_phone_number TEXT DEFAULT '+14165551234',
  p_message TEXT DEFAULT 'Test message from Art Battle'
) RETURNS JSONB AS $$
DECLARE
  v_message_id UUID;
  v_result JSONB;
BEGIN
  -- Send test SMS instantly
  v_message_id := send_sms_instantly(
    p_destination := p_phone_number,
    p_message_body := p_message,
    p_metadata := jsonb_build_object('type', 'test_message', 'timestamp', NOW())
  );
  
  -- Wait a moment for processing
  PERFORM pg_sleep(2);
  
  -- Check the result
  SELECT 
    jsonb_build_object(
      'message_id', id,
      'status', status,
      'sent_at', sent_at,
      'error', error_message,
      'metadata', metadata
    ) INTO v_result
  FROM message_queue
  WHERE id = v_message_id;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Check SMS configuration
DO $$
DECLARE
  v_config RECORD;
BEGIN
  RAISE NOTICE 'SMS Configuration:';
  FOR v_config IN SELECT * FROM sms_config ORDER BY key LOOP
    RAISE NOTICE '  %: %', v_config.key, 
      CASE 
        WHEN v_config.key LIKE '%key%' OR v_config.key LIKE '%token%' 
        THEN LEFT(v_config.value, 10) || '...' 
        ELSE v_config.value 
      END;
  END LOOP;
  
  -- Check if we have messages in queue
  RAISE NOTICE '';
  RAISE NOTICE 'Message Queue Status:';
  FOR v_config IN 
    SELECT status, COUNT(*) as count 
    FROM message_queue 
    WHERE channel = 'sms'
    GROUP BY status 
  LOOP
    RAISE NOTICE '  %: %', v_config.status, v_config.count;
  END LOOP;
  
  -- Check Twilio credentials in vault
  RAISE NOTICE '';
  RAISE NOTICE 'Checking for Twilio credentials in vault...';
  PERFORM 1 FROM vault.secrets WHERE name LIKE 'TWILIO%';
  IF FOUND THEN
    RAISE NOTICE '  Found Twilio credentials in vault';
  ELSE
    RAISE NOTICE '  WARNING: No Twilio credentials found in vault';
    RAISE NOTICE '  Please set: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER';
  END IF;
END $$;