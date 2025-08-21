                   pg_get_functiondef                    
---------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.delete_expired_logs()+
  RETURNS void                                          +
  LANGUAGE plpgsql                                      +
 AS $function$                                          +
 BEGIN                                                  +
     DELETE FROM system_logs WHERE expires_at < NOW();  +
 END;                                                   +
 $function$                                             +
 
(1 row)

