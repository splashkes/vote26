                           pg_get_functiondef                           
------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.cleanup_expired_qr_codes()          +
  RETURNS integer                                                      +
  LANGUAGE plpgsql                                                     +
 AS $function$                                                         +
 DECLARE                                                               +
   v_deleted_count INTEGER;                                            +
 BEGIN                                                                 +
   -- Delete codes older than 60 minutes (matching new expiration time)+
   DELETE FROM qr_codes                                                +
   WHERE generated_at < (NOW() - INTERVAL '60 minutes');               +
                                                                       +
   GET DIAGNOSTICS v_deleted_count = ROW_COUNT;                        +
                                                                       +
   RETURN v_deleted_count;                                             +
 END;                                                                  +
 $function$                                                            +
 
(1 row)

