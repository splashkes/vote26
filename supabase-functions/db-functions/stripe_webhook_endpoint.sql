                           pg_get_functiondef                            
-------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.stripe_webhook_endpoint()            +
  RETURNS text                                                          +
  LANGUAGE plpgsql                                                      +
  SECURITY DEFINER                                                      +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'       +
 AS $function$                                                          +
  BEGIN                                                                 +
    -- For now, just return success                                     +
    -- We can manually complete payments until we find a better solution+
    RETURN 'webhook received';                                          +
  END;                                                                  +
  $function$                                                            +
 
(1 row)

