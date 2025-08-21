                                                                   pg_get_functiondef                                                                   
--------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.block_ip_address(p_ip_address text, p_duration_minutes integer DEFAULT 60, p_reason text DEFAULT 'rate_limit'::text)+
  RETURNS void                                                                                                                                         +
  LANGUAGE plpgsql                                                                                                                                     +
  SECURITY DEFINER                                                                                                                                     +
 AS $function$                                                                                                                                         +
 DECLARE                                                                                                                                               +
   v_blocked_until TIMESTAMP WITH TIME ZONE;                                                                                                           +
   v_attempt_count INTEGER;                                                                                                                            +
 BEGIN                                                                                                                                                 +
   v_blocked_until := NOW() + INTERVAL '1 minute' * p_duration_minutes;                                                                                +
                                                                                                                                                       +
   -- Count recent failed attempts for this IP                                                                                                         +
   SELECT COUNT(*) INTO v_attempt_count                                                                                                                +
   FROM qr_validation_attempts                                                                                                                         +
   WHERE ip_address = p_ip_address                                                                                                                     +
     AND attempt_timestamp > (NOW() - INTERVAL '1 hour')                                                                                               +
     AND is_successful = false;                                                                                                                        +
                                                                                                                                                       +
   -- Insert or update block record                                                                                                                    +
   INSERT INTO blocked_ips (ip_address, blocked_until, reason, attempt_count)                                                                          +
   VALUES (p_ip_address, v_blocked_until, p_reason, v_attempt_count)                                                                                   +
   ON CONFLICT (ip_address)                                                                                                                            +
   DO UPDATE SET                                                                                                                                       +
     blocked_until = v_blocked_until,                                                                                                                  +
     reason = p_reason,                                                                                                                                +
     attempt_count = blocked_ips.attempt_count + 1,                                                                                                    +
     blocked_at = NOW();                                                                                                                               +
 END;                                                                                                                                                  +
 $function$                                                                                                                                            +
 
(1 row)

