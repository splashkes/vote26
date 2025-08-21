                      pg_get_functiondef                      
--------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.generate_qr_secret_token()+
  RETURNS text                                               +
  LANGUAGE plpgsql                                           +
 AS $function$                                               +
 BEGIN                                                       +
   RETURN encode(gen_random_bytes(32), 'hex');               +
 END;                                                        +
 $function$                                                  +
 
(1 row)

