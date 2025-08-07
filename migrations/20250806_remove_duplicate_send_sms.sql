-- Drop the 4-parameter version of send_sms_instantly to resolve ambiguity
DROP FUNCTION IF EXISTS send_sms_instantly(TEXT, TEXT, JSONB, TEXT);

-- The 3-parameter version should remain