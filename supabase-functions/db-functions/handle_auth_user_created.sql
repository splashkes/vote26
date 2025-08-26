                           pg_get_functiondef                           
------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.handle_auth_user_created()          +
  RETURNS trigger                                                      +
  LANGUAGE plpgsql                                                     +
  SECURITY DEFINER                                                     +
 AS $function$                                                         +
 BEGIN                                                                 +
   -- Only process if this user has a phone number                     +
   IF NEW.phone IS NOT NULL AND NEW.phone_confirmed_at IS NOT NULL THEN+
     -- Delay metadata sync slightly to avoid race conditions          +
     PERFORM pg_notify('auth_user_created', json_build_object(         +
       'user_id', NEW.id,                                              +
       'phone', NEW.phone                                              +
     )::text);                                                         +
   END IF;                                                             +
                                                                       +
   RETURN NEW;                                                         +
 END;                                                                  +
 $function$                                                            +
 
(1 row)

