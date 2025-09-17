                                     pg_get_functiondef                                      
---------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_auth_activity_summary(minutes_back integer DEFAULT 5)+
  RETURNS TABLE(activity_type text, count bigint, phone_numbers text[])                     +
  LANGUAGE sql                                                                              +
  SECURITY DEFINER                                                                          +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                           +
 AS $function$                                                                              +
    -- Successful phone confirmations (user_signedup with phone provider)                   +
    SELECT 'successful_logins' as activity_type,                                            +
           COUNT(*) as count,                                                               +
           array_agg(DISTINCT payload->>'actor_username') as phone_numbers                  +
    FROM auth.audit_log_entries                                                             +
    WHERE created_at >= NOW() - (minutes_back || ' minutes')::interval                      +
      AND payload->>'action' = 'user_signedup'                                              +
      AND payload->'traits'->>'provider' = 'phone'                                          +
                                                                                            +
    UNION ALL                                                                               +
                                                                                            +
    -- OTP requests without corresponding signup (potential failures)                       +
    SELECT 'otp_requests' as activity_type,                                                 +
           COUNT(*) as count,                                                               +
           array_agg(DISTINCT payload->>'actor_username') as phone_numbers                  +
    FROM auth.audit_log_entries                                                             +
    WHERE created_at >= NOW() - (minutes_back || ' minutes')::interval                      +
      AND payload->>'action' = 'user_confirmation_requested'                                +
      AND payload->'traits'->>'provider' = 'phone'                                          +
                                                                                            +
    UNION ALL                                                                               +
                                                                                            +
    -- SMS recovery requests                                                                +
    SELECT 'sms_recovery_requests' as activity_type,                                        +
           COUNT(*) as count,                                                               +
           array_agg(DISTINCT payload->>'actor_username') as phone_numbers                  +
    FROM auth.audit_log_entries                                                             +
    WHERE created_at >= NOW() - (minutes_back || ' minutes')::interval                      +
      AND payload->>'action' = 'user_recovery_requested'                                    +
      AND payload->'traits'->>'channel' = 'sms'                                             +
                                                                                            +
    UNION ALL                                                                               +
                                                                                            +
    -- Regular logins (email-based)                                                         +
    SELECT 'email_logins' as activity_type,                                                 +
           COUNT(*) as count,                                                               +
           array_agg(DISTINCT payload->>'actor_username') as phone_numbers                  +
    FROM auth.audit_log_entries                                                             +
    WHERE created_at >= NOW() - (minutes_back || ' minutes')::interval                      +
      AND payload->>'action' = 'login';                                                     +
  $function$                                                                                +
 
(1 row)

