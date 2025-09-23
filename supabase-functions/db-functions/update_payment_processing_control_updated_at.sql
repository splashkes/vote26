                                pg_get_functiondef                                
----------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.update_payment_processing_control_updated_at()+
  RETURNS trigger                                                                +
  LANGUAGE plpgsql                                                               +
 AS $function$                                                                   +
 BEGIN                                                                           +
     NEW.updated_at = NOW();                                                     +
                                                                                 +
     -- Reset daily counter if date changed                                      +
     IF NEW.daily_reset_date < CURRENT_DATE THEN                                 +
         NEW.daily_payment_count = 0;                                            +
         NEW.daily_reset_date = CURRENT_DATE;                                    +
     END IF;                                                                     +
                                                                                 +
     RETURN NEW;                                                                 +
 END;                                                                            +
 $function$                                                                      +
 
(1 row)

