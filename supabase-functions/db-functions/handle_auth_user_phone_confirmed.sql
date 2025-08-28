                               pg_get_functiondef                                
---------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.handle_auth_user_phone_confirmed()           +
  RETURNS trigger                                                               +
  LANGUAGE plpgsql                                                              +
  SECURITY DEFINER                                                              +
 AS $function$                                                                  +
 DECLARE                                                                        +
   person_record RECORD;                                                        +
   cleaned_phone TEXT;                                                          +
 BEGIN                                                                          +
   -- When phone gets confirmed, sync metadata directly                         +
   IF OLD.phone_confirmed_at IS NULL AND NEW.phone_confirmed_at IS NOT NULL THEN+
     -- Extract and clean phone number                                          +
     cleaned_phone := REPLACE(NEW.phone, ' ', '');                              +
                                                                                +
     -- Try to find person by different phone formats                           +
     SELECT id, hash, name                                                      +
     INTO person_record                                                         +
     FROM public.people                                                         +
     WHERE phone = cleaned_phone                                                +
        OR phone = '+' || cleaned_phone                                         +
        OR phone = SUBSTRING(cleaned_phone FROM 2)                              +
        OR phone_number = cleaned_phone                                         +
        OR phone_number = '+' || cleaned_phone                                  +
        OR phone_number = SUBSTRING(cleaned_phone FROM 2)                       +
     LIMIT 1;                                                                   +
                                                                                +
     -- If person found, update auth metadata                                   +
     IF person_record.id IS NOT NULL THEN                                       +
       UPDATE auth.users                                                        +
       SET raw_user_meta_data =                                                 +
         COALESCE(raw_user_meta_data, '{}'::jsonb) ||                           +
         jsonb_build_object(                                                    +
           'person_id', person_record.id,                                       +
           'person_hash', person_record.hash,                                   +
           'person_name', person_record.name                                    +
         )                                                                      +
       WHERE id = NEW.id;                                                       +
     END IF;                                                                    +
   END IF;                                                                      +
                                                                                +
   RETURN NEW;                                                                  +
 END;                                                                           +
 $function$                                                                     +
 
(1 row)

