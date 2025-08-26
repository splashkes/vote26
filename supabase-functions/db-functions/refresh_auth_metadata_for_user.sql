                                     pg_get_functiondef                                     
--------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.refresh_auth_metadata_for_user(user_id uuid)            +
  RETURNS void                                                                             +
  LANGUAGE plpgsql                                                                         +
  SECURITY DEFINER                                                                         +
 AS $function$                                                                             +
 DECLARE                                                                                   +
   result JSONB;                                                                           +
 BEGIN                                                                                     +
   -- Switch to the user's context temporarily and refresh metadata                        +
   PERFORM set_config('request.jwt.claims', json_build_object('sub', user_id)::text, true);+
   SELECT refresh_auth_metadata() INTO result;                                             +
   PERFORM set_config('request.jwt.claims', '', true);                                     +
 EXCEPTION WHEN OTHERS THEN                                                                +
   -- Log error but don't fail the auth process                                            +
   RAISE WARNING 'Failed to refresh auth metadata for user %: %', user_id, SQLERRM;        +
 END;                                                                                      +
 $function$                                                                                +
 
(1 row)

