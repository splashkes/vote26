                                                     pg_get_functiondef                                                     
----------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_current_user_admin_info()                                                           +
  RETURNS TABLE(id uuid, email text, level text, active boolean, created_at timestamp with time zone, cities_access text[])+
  LANGUAGE sql                                                                                                             +
  SECURITY DEFINER                                                                                                         +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                                          +
 AS $function$                                                                                                             +
    SELECT                                                                                                                 +
      au.id,                                                                                                               +
      au.email,                                                                                                            +
      au.level,                                                                                                            +
      au.active,                                                                                                           +
      au.created_at,                                                                                                       +
      au.cities_access                                                                                                     +
    FROM abhq_admin_users au                                                                                               +
    WHERE au.user_id = auth.uid()                                                                                          +
      AND au.active = true;                                                                                                +
  $function$                                                                                                               +
 
(1 row)

