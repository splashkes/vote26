                               pg_get_functiondef                                
---------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.handle_auth_user_phone_confirmed()           +
  RETURNS trigger                                                               +
  LANGUAGE plpgsql                                                              +
  SECURITY DEFINER                                                              +
 AS $function$                                                                  +
 BEGIN                                                                          +
   -- When phone gets confirmed, sync metadata                                  +
   IF OLD.phone_confirmed_at IS NULL AND NEW.phone_confirmed_at IS NOT NULL THEN+
     -- Call the metadata refresh function with explicit schema reference       +
     PERFORM public.refresh_auth_metadata_for_user(NEW.id);                     +
   END IF;                                                                      +
                                                                                +
   RETURN NEW;                                                                  +
 END;                                                                           +
 $function$                                                                     +
 
(1 row)

