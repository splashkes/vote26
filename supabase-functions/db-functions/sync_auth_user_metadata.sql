                               pg_get_functiondef                                
---------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.sync_auth_user_metadata()                    +
  RETURNS trigger                                                               +
  LANGUAGE plpgsql                                                              +
  SECURITY DEFINER                                                              +
 AS $function$                                                                  +
 DECLARE                                                                        +
   person_record RECORD;                                                        +
   cleaned_phone TEXT;                                                          +
   needs_update BOOLEAN := FALSE;                                               +
 BEGIN                                                                          +
   -- Skip if no phone number                                                   +
   IF NEW.phone IS NULL THEN                                                    +
     RETURN NEW;                                                                +
   END IF;                                                                      +
                                                                                +
   -- Check if metadata already exists to avoid unnecessary updates             +
   IF NEW.raw_user_meta_data IS NOT NULL AND                                    +
      NEW.raw_user_meta_data->>'person_id' IS NOT NULL THEN                     +
     RETURN NEW;                                                                +
   END IF;                                                                      +
                                                                                +
   -- Extract and clean phone number                                            +
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
   -- If person found, update metadata                                          +
   IF person_record.id IS NOT NULL THEN                                         +
     NEW.raw_user_meta_data := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb) || +
       jsonb_build_object(                                                      +
         'person_id', person_record.id,                                         +
         'person_hash', person_record.hash,                                     +
         'person_name', person_record.name                                      +
       );                                                                       +
   END IF;                                                                      +
                                                                                +
   RETURN NEW;                                                                  +
 END;                                                                           +
 $function$                                                                     +
 
(1 row)

