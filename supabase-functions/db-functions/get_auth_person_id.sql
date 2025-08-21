                            pg_get_functiondef                             
---------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_auth_person_id()                   +
  RETURNS uuid                                                            +
  LANGUAGE sql                                                            +
  STABLE SECURITY DEFINER                                                 +
 AS $function$                                                            +
   SELECT ((auth.jwt()->>'user_metadata'::text)::json->>'person_id')::uuid+
 $function$                                                               +
 
(1 row)

