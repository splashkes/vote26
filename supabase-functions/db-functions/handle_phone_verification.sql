                               pg_get_functiondef                               
--------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.handle_phone_verification()                 +
  RETURNS trigger                                                              +
  LANGUAGE plpgsql                                                             +
 AS $function$                                                                 +
 BEGIN                                                                         +
   -- Only process when phone_confirmed_at changes from NULL to a timestamp    +
   IF OLD.phone_confirmed_at IS NOT NULL OR NEW.phone_confirmed_at IS NULL THEN+
     RETURN NEW;                                                               +
   END IF;                                                                     +
                                                                               +
   -- Call shared linking function (in a separate transaction)                 +
   PERFORM ensure_person_linked(NEW.id);                                       +
                                                                               +
   RETURN NEW;                                                                 +
 END;                                                                          +
 $function$                                                                    +
 
(1 row)

