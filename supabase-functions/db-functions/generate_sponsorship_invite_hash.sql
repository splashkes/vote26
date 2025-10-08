                                 pg_get_functiondef                                  
-------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.generate_sponsorship_invite_hash()               +
  RETURNS text                                                                      +
  LANGUAGE plpgsql                                                                  +
 AS $function$                                                                      +
 DECLARE                                                                            +
   chars TEXT := 'abcdefghijklmnopqrstuvwxyz0123456789';                            +
   result TEXT := '';                                                               +
   i INTEGER;                                                                       +
 BEGIN                                                                              +
   FOR i IN 1..8 LOOP                                                               +
     result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);+
   END LOOP;                                                                        +
   RETURN result;                                                                   +
 END;                                                                               +
 $function$                                                                         +
 
(1 row)

