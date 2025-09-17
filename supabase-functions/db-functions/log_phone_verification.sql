                         pg_get_functiondef                          
---------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.log_phone_verification()         +
  RETURNS trigger                                                   +
  LANGUAGE plpgsql                                                  +
 AS $function$                                                      +
  BEGIN                                                             +
    -- Just log that phone was verified - no linking here           +
    INSERT INTO phone_verification_log (user_id, phone, verified_at)+
    VALUES (NEW.id, NEW.phone, NEW.phone_confirmed_at)              +
    ON CONFLICT (user_id) DO UPDATE SET                             +
      phone = EXCLUDED.phone,                                       +
      verified_at = EXCLUDED.verified_at;                           +
                                                                    +
    RETURN NEW;                                                     +
  END;                                                              +
  $function$                                                        +
 
(1 row)

