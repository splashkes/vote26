                             pg_get_functiondef                              
-----------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_artist_login_times(person_ids uuid[])+
  RETURNS TABLE(person_id uuid, last_sign_in_at timestamp with time zone)   +
  LANGUAGE plpgsql                                                          +
  SECURITY DEFINER                                                          +
 AS $function$                                                              +
 BEGIN                                                                      +
   RETURN QUERY                                                             +
   SELECT                                                                   +
     p.id AS person_id,                                                     +
     au.last_sign_in_at                                                     +
   FROM people p                                                            +
   LEFT JOIN auth.users au ON p.auth_user_id = au.id                        +
   WHERE p.id = ANY(person_ids);                                            +
 END;                                                                       +
 $function$                                                                 +
 
(1 row)

