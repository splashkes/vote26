                                 pg_get_functiondef                                 
------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.record_invitation_reminder_sent(user_email text)+
  RETURNS boolean                                                                  +
  LANGUAGE plpgsql                                                                 +
  SECURITY DEFINER                                                                 +
 AS $function$                                                                     +
 DECLARE                                                                           +
   updated_count INTEGER;                                                          +
 BEGIN                                                                             +
   UPDATE abhq_admin_users                                                         +
   SET                                                                             +
     last_invitation_reminder_sent = NOW(),                                        +
     invitation_reminder_count = COALESCE(invitation_reminder_count, 0) + 1,       +
     updated_at = NOW()                                                            +
   WHERE email = user_email                                                        +
     AND active = false                                                            +
     AND invitation_sent_at IS NOT NULL;                                           +
                                                                                   +
   GET DIAGNOSTICS updated_count = ROW_COUNT;                                      +
                                                                                   +
   RETURN updated_count > 0;                                                       +
 END;                                                                              +
 $function$                                                                        +
 
(1 row)

