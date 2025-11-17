                                        pg_get_functiondef                                         
---------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.is_phone_opted_out(phone_number_input text)                    +
  RETURNS boolean                                                                                 +
  LANGUAGE plpgsql                                                                                +
  SECURITY DEFINER                                                                                +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                 +
 AS $function$                                                                                    +
 BEGIN                                                                                            +
     -- Check if phone is in opt-outs table OR if person has message_blocked > 0                  +
     RETURN (                                                                                     +
         -- Check sms_marketing_optouts table                                                     +
         EXISTS (                                                                                 +
             SELECT 1 FROM sms_marketing_optouts                                                  +
             WHERE sms_marketing_optouts.phone_number = phone_number_input                        +
             AND sms_marketing_optouts.is_active = true                                           +
         )                                                                                        +
         OR                                                                                       +
         -- Check people.message_blocked field                                                    +
         EXISTS (                                                                                 +
             SELECT 1 FROM people                                                                 +
             WHERE (people.phone = phone_number_input OR people.phone_number = phone_number_input)+
             AND people.message_blocked > 0                                                       +
         )                                                                                        +
     );                                                                                           +
 END;                                                                                             +
 $function$                                                                                       +
 
(1 row)

