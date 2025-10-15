                                     pg_get_functiondef                                     
--------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.generate_fulfillment_hash()                             +
  RETURNS trigger                                                                          +
  LANGUAGE plpgsql                                                                         +
 AS $function$                                                                             +
 BEGIN                                                                                     +
   -- Generate a 40-character hash for fulfillment (differentiate from 32-char invite hash)+
   NEW.fulfillment_hash := encode(gen_random_bytes(20), 'hex');                            +
   RETURN NEW;                                                                             +
 END;                                                                                      +
 $function$                                                                                +
 
(1 row)

