                       pg_get_functiondef                       
----------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_secret(secret_name text)+
  RETURNS text                                                 +
  LANGUAGE plpgsql                                             +
  SECURITY DEFINER                                             +
 AS $function$                                                 +
 DECLARE                                                       +
   secret_value text;                                          +
 BEGIN                                                         +
   SELECT decrypted_secret INTO secret_value                   +
   FROM vault.decrypted_secrets                                +
   WHERE name = secret_name;                                   +
                                                               +
   RETURN secret_value;                                        +
 END;                                                          +
 $function$                                                    +
 
(1 row)

