                   pg_get_functiondef                   
--------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.debug_auth_context()+
  RETURNS jsonb                                        +
  LANGUAGE plpgsql                                     +
  SECURITY DEFINER                                     +
 AS $function$                                         +
 BEGIN                                                 +
   RETURN jsonb_build_object(                          +
     'auth_uid', auth.uid(),                           +
     'auth_role', auth.role(),                         +
     'current_user', current_user,                     +
     'session_user', session_user                      +
   );                                                  +
 END;                                                  +
 $function$                                            +
 
(1 row)

