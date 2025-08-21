                     pg_get_functiondef                     
------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.cleanup_security_logs() +
  RETURNS integer                                          +
  LANGUAGE plpgsql                                         +
  SECURITY DEFINER                                         +
 AS $function$                                             +
 DECLARE                                                   +
   v_deleted_attempts INTEGER;                             +
   v_deleted_blocks INTEGER;                               +
 BEGIN                                                     +
   -- Delete attempts older than 24 hours                  +
   DELETE FROM qr_validation_attempts                      +
   WHERE attempt_timestamp < (NOW() - INTERVAL '24 hours');+
                                                           +
   GET DIAGNOSTICS v_deleted_attempts = ROW_COUNT;         +
                                                           +
   -- Delete expired blocks                                +
   DELETE FROM blocked_ips                                 +
   WHERE blocked_until < NOW();                            +
                                                           +
   GET DIAGNOSTICS v_deleted_blocks = ROW_COUNT;           +
                                                           +
   RETURN v_deleted_attempts + v_deleted_blocks;           +
 END;                                                      +
 $function$                                                +
 
(1 row)

