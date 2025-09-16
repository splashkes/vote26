                 pg_get_functiondef                 
----------------------------------------------------
 CREATE OR REPLACE FUNCTION public.is_super_admin()+
  RETURNS boolean                                  +
  LANGUAGE plpgsql                                 +
  SECURITY DEFINER                                 +
 AS $function$                                     +
 BEGIN                                             +
     RETURN EXISTS (                               +
         SELECT 1                                  +
         FROM abhq_admin_users                     +
         WHERE user_id = auth.uid()                +
         AND active = true                         +
         AND level = 'super'                       +
     );                                            +
 END;                                              +
 $function$                                        +
 
(1 row)

