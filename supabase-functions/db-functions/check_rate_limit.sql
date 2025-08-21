                                                              pg_get_functiondef                                                              
----------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.check_rate_limit(p_ip_address text, p_window_minutes integer DEFAULT 5, p_max_attempts integer DEFAULT 10)+
  RETURNS boolean                                                                                                                            +
  LANGUAGE plpgsql                                                                                                                           +
  STABLE SECURITY DEFINER                                                                                                                    +
 AS $function$                                                                                                                               +
 DECLARE                                                                                                                                     +
   v_attempt_count INTEGER;                                                                                                                  +
   v_is_over_limit BOOLEAN;                                                                                                                  +
 BEGIN                                                                                                                                       +
   -- Count attempts in the last X minutes                                                                                                   +
   SELECT COUNT(*) INTO v_attempt_count                                                                                                      +
   FROM qr_validation_attempts                                                                                                               +
   WHERE ip_address = p_ip_address                                                                                                           +
     AND attempt_timestamp > (NOW() - INTERVAL '1 minute' * p_window_minutes);                                                               +
                                                                                                                                             +
   v_is_over_limit := v_attempt_count >= p_max_attempts;                                                                                     +
                                                                                                                                             +
   RETURN v_is_over_limit;                                                                                                                   +
 END;                                                                                                                                        +
 $function$                                                                                                                                  +
 
(1 row)

