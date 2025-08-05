-- Enable notice logging to see debug messages
SET client_min_messages = 'notice';

-- Test process_bid_secure with auth context
DO $$
DECLARE
  v_result JSONB;
BEGIN
  -- Set auth context (simulating authenticated user)
  PERFORM set_config('request.jwt.claim.sub', '8c3f873b-8433-49a3-a448-ab1b81aa609f', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"8c3f873b-8433-49a3-a448-ab1b81aa609f","phone":"14163025959","role":"authenticated"}', true);
  
  -- Call process_bid_secure
  v_result := process_bid_secure('AB3032-1-3', 85);
  
  RAISE NOTICE 'Result: %', v_result;
END $$;