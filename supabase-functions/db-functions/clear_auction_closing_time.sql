                              pg_get_functiondef                               
-------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.clear_auction_closing_time(p_art_code text)+
  RETURNS jsonb                                                               +
  LANGUAGE plpgsql                                                            +
  SECURITY DEFINER                                                            +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'             +
 AS $function$                                                                +
  DECLARE                                                                     +
    v_rows_updated INT;                                                       +
  BEGIN                                                                       +
    UPDATE art                                                                +
    SET closing_time = NULL                                                   +
    WHERE art_code = p_art_code                                               +
      AND status = 'active'::art_status;                                      +
                                                                              +
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;                               +
                                                                              +
    IF v_rows_updated > 0 THEN                                                +
      RETURN jsonb_build_object(                                              +
        'success', true,                                                      +
        'message', format('Cleared closing time for %s', p_art_code)          +
      );                                                                      +
    ELSE                                                                      +
      RETURN jsonb_build_object(                                              +
        'success', false,                                                     +
        'error', 'Art not found or not active'                                +
      );                                                                      +
    END IF;                                                                   +
  END;                                                                        +
  $function$                                                                  +
 
(1 row)

