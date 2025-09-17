                                   pg_get_functiondef                                    
-----------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.retry_failed_messages(p_hours_ago integer DEFAULT 24)+
  RETURNS integer                                                                       +
  LANGUAGE plpgsql                                                                      +
 AS $function$                                                                          +
  DECLARE                                                                               +
    v_count int;                                                                        +
  BEGIN                                                                                 +
    UPDATE message_queue                                                                +
    SET                                                                                 +
      status = 'pending',                                                               +
      retry_count = 0,                                                                  +
      send_after = NOW()                                                                +
    WHERE                                                                               +
      status = 'failed'                                                                 +
      AND created_at > NOW() - INTERVAL '1 hour' * p_hours_ago                          +
      AND channel = 'sms';                                                              +
                                                                                        +
    GET DIAGNOSTICS v_count = ROW_COUNT;                                                +
    RETURN v_count;                                                                     +
  END;                                                                                  +
  $function$                                                                            +
 
(1 row)

