                                        pg_get_functiondef                                        
--------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.emergency_fix_unlinked_users()                                +
  RETURNS TABLE(fixed_users integer, users_linked integer)                                       +
  LANGUAGE plpgsql                                                                               +
  SECURITY DEFINER                                                                               +
 AS $function$                                                                                   +
 DECLARE                                                                                         +
   users_created INTEGER := 0;                                                                   +
   metadata_updated INTEGER := 0;                                                                +
 BEGIN                                                                                           +
   -- Step 1: Create person records for users with no person links                               +
   INSERT INTO people (id, auth_user_id, phone, name, nickname, verified, created_at, updated_at)+
   SELECT                                                                                        +
     gen_random_uuid(),                                                                          +
     au.id,                                                                                      +
     CASE                                                                                        +
       WHEN au.phone LIKE '64%' THEN '+64' || SUBSTRING(au.phone FROM 3)                         +
       WHEN au.phone LIKE '+%' THEN au.phone                                                     +
       ELSE '+1' || au.phone                                                                     +
     END,                                                                                        +
     'User',                                                                                     +
     'User',                                                                                     +
     true,                                                                                       +
     NOW(),                                                                                      +
     NOW()                                                                                       +
   FROM auth.users au                                                                            +
   WHERE au.phone_confirmed_at IS NOT NULL                                                       +
   AND au.id NOT IN (SELECT auth_user_id FROM people WHERE auth_user_id IS NOT NULL);            +
                                                                                                 +
   GET DIAGNOSTICS users_created = ROW_COUNT;                                                    +
                                                                                                 +
   -- Step 2: Fix metadata for all users missing it                                              +
   UPDATE auth.users                                                                             +
   SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(     +
     'person_id', p.id::text,                                                                    +
     'person_name', COALESCE(p.name, 'User')                                                     +
   )                                                                                             +
   FROM people p                                                                                 +
   WHERE p.auth_user_id = auth.users.id                                                          +
   AND auth.users.raw_user_meta_data->>'person_id' IS NULL;                                      +
                                                                                                 +
   GET DIAGNOSTICS metadata_updated = ROW_COUNT;                                                 +
                                                                                                 +
   RETURN QUERY SELECT users_created, metadata_updated;                                          +
 END;                                                                                            +
 $function$                                                                                      +
 
(1 row)

