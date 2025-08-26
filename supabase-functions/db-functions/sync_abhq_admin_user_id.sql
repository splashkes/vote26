                      pg_get_functiondef                       
---------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.sync_abhq_admin_user_id()  +
  RETURNS trigger                                             +
  LANGUAGE plpgsql                                            +
  SECURITY DEFINER                                            +
 AS $function$                                                +
 BEGIN                                                        +
   -- Try to find user_id from auth.users table               +
   UPDATE abhq_admin_users                                    +
   SET user_id = (                                            +
     SELECT id FROM auth.users WHERE email = NEW.email LIMIT 1+
   )                                                          +
   WHERE id = NEW.id AND user_id IS NULL;                     +
                                                              +
   RETURN NEW;                                                +
 END;                                                         +
 $function$                                                   +
 
(1 row)

