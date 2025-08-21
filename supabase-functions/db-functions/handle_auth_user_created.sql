                                pg_get_functiondef                                 
-----------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.handle_auth_user_created()                     +
  RETURNS trigger                                                                 +
  LANGUAGE plpgsql                                                                +
  SECURITY DEFINER                                                                +
 AS $function$                                                                    +
 DECLARE                                                                          +
   person_record RECORD;                                                          +
   cleaned_phone TEXT;                                                            +
 BEGIN                                                                            +
   -- Clean the phone number                                                      +
   IF NEW.phone IS NOT NULL THEN                                                  +
     cleaned_phone := REPLACE(NEW.phone, ' ', '');                                +
                                                                                  +
     -- Try to find person by different phone formats                             +
     SELECT id, hash, name                                                        +
     INTO person_record                                                           +
     FROM public.people                                                           +
     WHERE phone = cleaned_phone                                                  +
        OR phone = '+' || cleaned_phone                                           +
        OR phone = SUBSTRING(cleaned_phone FROM 2)                                +
        OR phone_number = cleaned_phone                                           +
        OR phone_number = '+' || cleaned_phone                                    +
        OR phone_number = SUBSTRING(cleaned_phone FROM 2)                         +
     LIMIT 1;                                                                     +
                                                                                  +
     -- If person found, update auth metadata immediately                         +
     IF person_record.id IS NOT NULL THEN                                         +
       NEW.raw_user_meta_data := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb) || +
         jsonb_build_object(                                                      +
           'person_id', person_record.id,                                         +
           'person_hash', person_record.hash,                                     +
           'person_name', person_record.name                                      +
         );                                                                       +
     END IF;                                                                      +
   END IF;                                                                        +
                                                                                  +
   RETURN NEW;                                                                    +
 END;                                                                             +
 $function$                                                                       +
 
(1 row)

