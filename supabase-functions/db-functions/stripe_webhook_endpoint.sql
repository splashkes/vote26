                           pg_get_functiondef                           
------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.stripe_webhook_endpoint()           +
  RETURNS text                                                         +
  LANGUAGE plpgsql                                                     +
  SECURITY DEFINER                                                     +
 AS $function$                                                         +
 BEGIN                                                                 +
   -- For now, just return success                                     +
   -- We can manually complete payments until we find a better solution+
   RETURN 'webhook received';                                          +
 END;                                                                  +
 $function$                                                            +
 
(1 row)

