                               pg_get_functiondef                                
---------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_event_from_qr_secret(p_secret_token text)+
  RETURNS uuid                                                                  +
  LANGUAGE plpgsql                                                              +
  SECURITY DEFINER                                                              +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'               +
 AS $function$                                                                  +
  DECLARE                                                                       +
    v_event_id UUID;                                                            +
  BEGIN                                                                         +
    SELECT event_id INTO v_event_id                                             +
    FROM event_qr_secrets                                                       +
    WHERE secret_token = p_secret_token                                         +
      AND is_active = true;                                                     +
                                                                                +
    RETURN v_event_id;                                                          +
  END;                                                                          +
  $function$                                                                    +
 
(1 row)

