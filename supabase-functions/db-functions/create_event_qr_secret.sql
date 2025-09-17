                            pg_get_functiondef                             
---------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.create_event_qr_secret(p_event_id uuid)+
  RETURNS text                                                            +
  LANGUAGE plpgsql                                                        +
  SECURITY DEFINER                                                        +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'         +
 AS $function$                                                            +
  DECLARE                                                                 +
    v_secret_token TEXT;                                                  +
  BEGIN                                                                   +
    -- Deactivate existing secrets for this event                         +
    UPDATE event_qr_secrets                                               +
    SET is_active = false                                                 +
    WHERE event_id = p_event_id;                                          +
                                                                          +
    -- Generate new secret token                                          +
    v_secret_token := generate_qr_secret_token();                         +
                                                                          +
    -- Insert new secret                                                  +
    INSERT INTO event_qr_secrets (event_id, secret_token, is_active)      +
    VALUES (p_event_id, v_secret_token, true);                            +
                                                                          +
    RETURN v_secret_token;                                                +
  END;                                                                    +
  $function$                                                              +
 
(1 row)

