                     pg_get_functiondef                     
------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.sync_confirmation_date()+
  RETURNS trigger                                          +
  LANGUAGE plpgsql                                         +
 AS $function$                                             +
  BEGIN                                                    +
    IF NEW.entry_date IS NOT NULL THEN                     +
      NEW.confirmation_date = NEW.entry_date;              +
    END IF;                                                +
    RETURN NEW;                                            +
  END;                                                     +
  $function$                                               +
 
(1 row)

