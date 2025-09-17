                                                                                 pg_get_functiondef                                                                                  
-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_recent_auth_activity(minutes_back integer DEFAULT 5)                                                                                         +
  RETURNS TABLE(id uuid, phone text, phone_confirmed_at timestamp with time zone, created_at timestamp with time zone, last_sign_in_at timestamp with time zone, activity_type text)+
  LANGUAGE sql                                                                                                                                                                      +
  SECURITY DEFINER                                                                                                                                                                  +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                                                                                                   +
 AS $function$                                                                                                                                                                      +
    SELECT                                                                                                                                                                          +
      u.id,                                                                                                                                                                         +
      u.phone,                                                                                                                                                                      +
      u.phone_confirmed_at,                                                                                                                                                         +
      u.created_at,                                                                                                                                                                 +
      u.last_sign_in_at,                                                                                                                                                            +
      CASE                                                                                                                                                                          +
        WHEN u.phone_confirmed_at >= NOW() - (minutes_back || ' minutes')::interval THEN 'phone_confirmed'                                                                          +
        WHEN u.last_sign_in_at >= NOW() - (minutes_back || ' minutes')::interval THEN 'sign_in'                                                                                     +
        ELSE 'other'                                                                                                                                                                +
      END as activity_type                                                                                                                                                          +
    FROM auth.users u                                                                                                                                                               +
    WHERE u.phone IS NOT NULL                                                                                                                                                       +
      AND (                                                                                                                                                                         +
        u.phone_confirmed_at >= NOW() - (minutes_back || ' minutes')::interval                                                                                                      +
        OR u.last_sign_in_at >= NOW() - (minutes_back || ' minutes')::interval                                                                                                      +
      );                                                                                                                                                                            +
  $function$                                                                                                                                                                        +
 
(1 row)

