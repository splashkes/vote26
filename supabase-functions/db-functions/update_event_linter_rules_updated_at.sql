                            pg_get_functiondef                            
--------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.update_event_linter_rules_updated_at()+
  RETURNS trigger                                                        +
  LANGUAGE plpgsql                                                       +
 AS $function$                                                           +
 BEGIN                                                                   +
   NEW.updated_at = NOW();                                               +
   RETURN NEW;                                                           +
 END;                                                                    +
 $function$                                                              +
 
(1 row)

