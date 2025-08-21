                        pg_get_functiondef                         
-------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.migrate_auth_phone_numbers()   +
  RETURNS void                                                    +
  LANGUAGE plpgsql                                                +
 AS $function$                                                    +
 BEGIN                                                            +
   -- Update people records with auth phone numbers where possible+
   UPDATE people p                                                +
   SET                                                            +
     auth_user_id = u.id,                                         +
     auth_phone = u.raw_user_meta_data->>'phone'                  +
   FROM auth.users u                                              +
   WHERE u.raw_user_meta_data->>'phone' = p.phone_number          +
     AND p.auth_user_id IS NULL;                                  +
 END;                                                             +
 $function$                                                       +
 
(1 row)

