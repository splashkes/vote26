                                                     pg_get_functiondef                                                      
-----------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.set_event_auction_closing_times(p_event_id uuid, p_closing_time timestamp with time zone)+
  RETURNS integer                                                                                                           +
  LANGUAGE plpgsql                                                                                                          +
 AS $function$                                                                                                              +
  DECLARE                                                                                                                   +
    v_updated INTEGER;                                                                                                      +
  BEGIN                                                                                                                     +
    UPDATE art                                                                                                              +
    SET                                                                                                                     +
      closing_time = p_closing_time,                                                                                        +
      updated_at = NOW()                                                                                                    +
    WHERE event_id = p_event_id                                                                                             +
      AND status = 'active';                                                                                                +
                                                                                                                            +
    GET DIAGNOSTICS v_updated = ROW_COUNT;                                                                                  +
                                                                                                                            +
    RETURN v_updated;                                                                                                       +
  END;                                                                                                                      +
  $function$                                                                                                                +
 
(1 row)

