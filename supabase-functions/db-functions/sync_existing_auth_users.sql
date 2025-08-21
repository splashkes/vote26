                              pg_get_functiondef                               
-------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.sync_existing_auth_users()                 +
  RETURNS void                                                                +
  LANGUAGE plpgsql                                                            +
  SECURITY DEFINER                                                            +
 AS $function$                                                                +
 DECLARE                                                                      +
   auth_record RECORD;                                                        +
   person_record RECORD;                                                      +
   cleaned_phone TEXT;                                                        +
 BEGIN                                                                        +
   FOR auth_record IN SELECT id, phone FROM auth.users WHERE phone IS NOT NULL+
   LOOP                                                                       +
     cleaned_phone := REPLACE(auth_record.phone, ' ', '');                    +
                                                                              +
     SELECT id, hash, name                                                    +
     INTO person_record                                                       +
     FROM public.people                                                       +
     WHERE phone = cleaned_phone                                              +
        OR phone = '+' || cleaned_phone                                       +
        OR phone = SUBSTRING(cleaned_phone FROM 2)                            +
        OR phone_number = cleaned_phone                                       +
        OR phone_number = '+' || cleaned_phone                                +
        OR phone_number = SUBSTRING(cleaned_phone FROM 2)                     +
     LIMIT 1;                                                                 +
                                                                              +
     IF person_record.id IS NOT NULL THEN                                     +
       UPDATE auth.users                                                      +
       SET raw_user_meta_data =                                               +
         COALESCE(raw_user_meta_data, '{}'::jsonb) ||                         +
         jsonb_build_object(                                                  +
           'person_id', person_record.id,                                     +
           'person_hash', person_record.hash,                                 +
           'person_name', person_record.name                                  +
         )                                                                    +
       WHERE id = auth_record.id;                                             +
     END IF;                                                                  +
   END LOOP;                                                                  +
 END;                                                                         +
 $function$                                                                   +
 
(1 row)

