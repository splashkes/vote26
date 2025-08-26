                       pg_get_functiondef                       
----------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.normalize_admin_user_email()+
  RETURNS trigger                                              +
  LANGUAGE plpgsql                                             +
 AS $function$                                                 +
 BEGIN                                                         +
     -- Normalize email to lowercase for consistency           +
     NEW.email = LOWER(TRIM(NEW.email));                       +
     RETURN NEW;                                               +
 END;                                                          +
 $function$                                                    +
 
(1 row)

