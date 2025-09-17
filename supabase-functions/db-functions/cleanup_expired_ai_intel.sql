                        pg_get_functiondef                        
------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.cleanup_expired_ai_intel()    +
  RETURNS integer                                                +
  LANGUAGE plpgsql                                               +
  SECURITY DEFINER                                               +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'+
 AS $function$                                                   +
  DECLARE                                                        +
    deleted_count INTEGER;                                       +
  BEGIN                                                          +
    DELETE FROM artist_ai_intel                                  +
    WHERE expires_at < NOW();                                    +
                                                                 +
    GET DIAGNOSTICS deleted_count = ROW_COUNT;                   +
                                                                 +
    RETURN deleted_count;                                        +
  END;                                                           +
  $function$                                                     +
 
(1 row)

