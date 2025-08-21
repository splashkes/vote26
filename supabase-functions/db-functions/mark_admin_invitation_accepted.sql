                                pg_get_functiondef                                 
-----------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.mark_admin_invitation_accepted(user_email text)+
  RETURNS boolean                                                                 +
  LANGUAGE plpgsql                                                                +
  SECURITY DEFINER                                                                +
 AS $function$                                                                    +
 DECLARE                                                                          +
   updated_count INTEGER;                                                         +
 BEGIN                                                                            +
   UPDATE abhq_admin_users                                                        +
   SET                                                                            +
     invitation_accepted_at = NOW(),                                              +
     active = true,                                                               +
     updated_at = NOW()                                                           +
   WHERE email = user_email                                                       +
     AND active = false                                                           +
     AND invitation_sent_at IS NOT NULL;                                          +
                                                                                  +
   GET DIAGNOSTICS updated_count = ROW_COUNT;                                     +
                                                                                  +
   RETURN updated_count > 0;                                                      +
 END;                                                                             +
 $function$                                                                       +
 
(1 row)

