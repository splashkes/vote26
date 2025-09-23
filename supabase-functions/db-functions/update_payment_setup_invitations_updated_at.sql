                               pg_get_functiondef                                
---------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.update_payment_setup_invitations_updated_at()+
  RETURNS trigger                                                               +
  LANGUAGE plpgsql                                                              +
 AS $function$                                                                  +
 BEGIN                                                                          +
     NEW.updated_at = NOW();                                                    +
     RETURN NEW;                                                                +
 END;                                                                           +
 $function$                                                                     +
 
(1 row)

