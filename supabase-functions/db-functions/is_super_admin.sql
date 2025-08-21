                 pg_get_functiondef                 
----------------------------------------------------
 CREATE OR REPLACE FUNCTION public.is_super_admin()+
  RETURNS boolean                                  +
  LANGUAGE sql                                     +
  SECURITY DEFINER                                 +
 AS $function$                                     +
   SELECT EXISTS (                                 +
     SELECT 1 FROM abhq_admin_users                +
     WHERE user_id = auth.uid()                    +
     AND level = 'super'                           +
     AND active = true                             +
   );                                              +
 $function$                                        +
 
(1 row)

