                                                                     pg_get_functiondef                                                                     
------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.record_validation_attempt(p_ip_address text, p_user_id uuid, p_qr_code text, p_is_successful boolean, p_user_agent text)+
  RETURNS void                                                                                                                                             +
  LANGUAGE plpgsql                                                                                                                                         +
  SECURITY DEFINER                                                                                                                                         +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                                                                          +
 AS $function$                                                                                                                                             +
  BEGIN                                                                                                                                                    +
    INSERT INTO qr_validation_attempts (                                                                                                                   +
      ip_address,                                                                                                                                          +
      user_id,                                                                                                                                             +
      qr_code,                                                                                                                                             +
      is_successful,                                                                                                                                       +
      user_agent                                                                                                                                           +
    ) VALUES (                                                                                                                                             +
      p_ip_address,                                                                                                                                        +
      p_user_id,                                                                                                                                           +
      p_qr_code,                                                                                                                                           +
      p_is_successful,                                                                                                                                     +
      p_user_agent                                                                                                                                         +
    );                                                                                                                                                     +
  END;                                                                                                                                                     +
  $function$                                                                                                                                               +
 
(1 row)

