                              pg_get_functiondef                               
-------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.is_phone_opted_out(phone_number_input text)+
  RETURNS boolean                                                             +
  LANGUAGE plpgsql                                                            +
  SECURITY DEFINER                                                            +
 AS $function$                                                                +
 BEGIN                                                                        +
     RETURN EXISTS (                                                          +
         SELECT 1 FROM sms_marketing_optouts                                  +
         WHERE sms_marketing_optouts.phone_number = phone_number_input        +
         AND sms_marketing_optouts.is_active = true                           +
     );                                                                       +
 END;                                                                         +
 $function$                                                                   +
 
(1 row)

