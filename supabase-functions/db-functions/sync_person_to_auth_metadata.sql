                          pg_get_functiondef                          
----------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.sync_person_to_auth_metadata()    +
  RETURNS trigger                                                    +
  LANGUAGE plpgsql                                                   +
  SECURITY DEFINER                                                   +
 AS $function$                                                       +
 DECLARE                                                             +
   person_record RECORD;                                             +
   cleaned_phone TEXT;                                               +
 BEGIN                                                               +
   -- Only process on INSERT (new auth session)                      +
   IF TG_OP != 'INSERT' THEN                                         +
     RETURN NEW;                                                     +
   END IF;                                                           +
                                                                     +
   -- Extract and clean phone number                                 +
   cleaned_phone := REPLACE(NEW.phone, ' ', '');                     +
                                                                     +
   -- Try to find person by different phone formats                  +
   SELECT id, hash, name                                             +
   INTO person_record                                                +
   FROM public.people                                                +
   WHERE phone = cleaned_phone                                       +
      OR phone = '+' || cleaned_phone                                +
      OR phone = SUBSTRING(cleaned_phone FROM 2)  -- Remove leading 1+
      OR phone_number = cleaned_phone                                +
      OR phone_number = '+' || cleaned_phone                         +
      OR phone_number = SUBSTRING(cleaned_phone FROM 2)              +
   LIMIT 1;                                                          +
                                                                     +
   -- If person found, update auth metadata                          +
   IF person_record.id IS NOT NULL THEN                              +
     UPDATE auth.users                                               +
     SET raw_user_meta_data =                                        +
       COALESCE(raw_user_meta_data, '{}'::jsonb) ||                  +
       jsonb_build_object(                                           +
         'person_id', person_record.id,                              +
         'person_hash', person_record.hash,                          +
         'person_name', person_record.name                           +
       )                                                             +
     WHERE id = NEW.id;                                              +
   END IF;                                                           +
                                                                     +
   RETURN NEW;                                                       +
 END;                                                                +
 $function$                                                          +
 
(1 row)

