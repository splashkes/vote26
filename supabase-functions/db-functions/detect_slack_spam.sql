                               pg_get_functiondef                               
--------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.detect_slack_spam()                         +
  RETURNS TABLE(alert_type text, count bigint, description text)               +
  LANGUAGE plpgsql                                                             +
  SECURITY DEFINER                                                             +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'              +
 AS $function$                                                                 +
  BEGIN                                                                        +
    -- Check for too many pending notifications                                +
    RETURN QUERY                                                               +
    SELECT                                                                     +
      'HIGH_PENDING_VOLUME'::TEXT,                                             +
      COUNT(*),                                                                +
      'Too many pending notifications - possible spam'::TEXT                   +
    FROM slack_notifications                                                   +
    WHERE status = 'pending'                                                   +
      AND created_at >= NOW() - INTERVAL '10 minutes'                          +
    HAVING COUNT(*) > 20;                                                      +
                                                                               +
    -- Check for generic "Art Battle Notification" messages                    +
    RETURN QUERY                                                               +
    SELECT                                                                     +
      'GENERIC_MESSAGE_SPAM'::TEXT,                                            +
      COUNT(*),                                                                +
      'Generic fallback messages being sent - investigate payload issues'::TEXT+
    FROM slack_notifications                                                   +
    WHERE payload->>'text' = 'Art Battle Notification'                         +
      AND created_at >= NOW() - INTERVAL '10 minutes'                          +
    HAVING COUNT(*) > 5;                                                       +
                                                                               +
    -- Check for too many test messages                                        +
    RETURN QUERY                                                               +
    SELECT                                                                     +
      'TEST_MESSAGE_LEAKAGE'::TEXT,                                            +
      COUNT(*),                                                                +
      'Test messages in production queue - clean up needed'::TEXT              +
    FROM slack_notifications                                                   +
    WHERE (message_type LIKE '%test%' OR payload->>'test_run' = 'true')        +
      AND status IN ('pending', 'pending_lookup')                              +
    HAVING COUNT(*) > 0;                                                       +
                                                                               +
    -- Check for repeated failures                                             +
    RETURN QUERY                                                               +
    SELECT                                                                     +
      'REPEATED_FAILURES'::TEXT,                                               +
      COUNT(*),                                                                +
      'Many notifications failing repeatedly - check Slack integration'::TEXT  +
    FROM slack_notifications                                                   +
    WHERE status = 'failed'                                                    +
      AND attempts >= 3                                                        +
      AND created_at >= NOW() - INTERVAL '1 hour'                              +
    HAVING COUNT(*) > 10;                                                      +
  END;                                                                         +
  $function$                                                                   +
 
(1 row)

