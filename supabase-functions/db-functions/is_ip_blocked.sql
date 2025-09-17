                         pg_get_functiondef                         
--------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.is_ip_blocked(p_ip_address text)+
  RETURNS boolean                                                  +
  LANGUAGE plpgsql                                                 +
  STABLE SECURITY DEFINER                                          +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'  +
 AS $function$                                                     +
  DECLARE                                                          +
    v_is_blocked BOOLEAN;                                          +
  BEGIN                                                            +
    -- Check if IP is currently blocked (and not expired)          +
    SELECT EXISTS(                                                 +
      SELECT 1 FROM blocked_ips                                    +
      WHERE ip_address = p_ip_address                              +
        AND blocked_until > NOW()                                  +
    ) INTO v_is_blocked;                                           +
                                                                   +
    RETURN COALESCE(v_is_blocked, false);                          +
  END;                                                             +
  $function$                                                       +
 
(1 row)

