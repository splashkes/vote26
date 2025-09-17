                           pg_get_functiondef                           
------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.cleanup_old_logs()                  +
  RETURNS trigger                                                      +
  LANGUAGE plpgsql                                                     +
 AS $function$                                                         +
  BEGIN                                                                +
      -- Clean up old logs on every 100th insert (statistical sampling)+
      IF random() < 0.01 THEN                                          +
          DELETE FROM system_logs WHERE expires_at < NOW();            +
      END IF;                                                          +
      RETURN NEW;                                                      +
  END;                                                                 +
  $function$                                                           +
 
(1 row)

