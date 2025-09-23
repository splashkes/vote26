                  pg_get_functiondef                   
-------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.expire_old_offers()+
  RETURNS integer                                     +
  LANGUAGE plpgsql                                    +
  SECURITY DEFINER                                    +
 AS $function$                                        +
 DECLARE                                              +
   expired_count INTEGER;                             +
 BEGIN                                                +
   UPDATE artwork_offers                              +
   SET status = 'expired', updated_at = NOW()         +
   WHERE status = 'pending'                           +
     AND expires_at <= NOW();                         +
                                                      +
   GET DIAGNOSTICS expired_count = ROW_COUNT;         +
   RETURN expired_count;                              +
 END;                                                 +
 $function$                                           +
 
(1 row)

