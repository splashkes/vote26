                                    pg_get_functiondef                                     
-------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.fix_corrupted_user_links()                             +
  RETURNS jsonb                                                                           +
  LANGUAGE plpgsql                                                                        +
 AS $function$                                                                            +
 DECLARE                                                                                  +
   v_user RECORD;                                                                         +
   v_intended_person RECORD;                                                              +
   v_empty_person RECORD;                                                                 +
   v_fixed_count INT := 0;                                                                +
   v_error_count INT := 0;                                                                +
   v_results JSONB[] := ARRAY[]::JSONB[];                                                 +
   v_result JSONB;                                                                        +
 BEGIN                                                                                    +
   -- Find all users with person record mismatches                                        +
   FOR v_user IN                                                                          +
     SELECT                                                                               +
       au.id as auth_user_id,                                                             +
       au.phone as auth_phone,                                                            +
       au.raw_user_meta_data->>'person_id' as metadata_person_id,                         +
       au.raw_user_meta_data->>'person_name' as metadata_person_name,                     +
       p_linked.id as linked_person_id,                                                   +
       p_linked.name as linked_person_name                                                +
     FROM auth.users au                                                                   +
     JOIN people p_linked ON p_linked.auth_user_id = au.id                                +
     WHERE au.raw_user_meta_data->>'person_id' IS NOT NULL                                +
       AND au.raw_user_meta_data->>'person_id' != p_linked.id::text                       +
       AND (p_linked.name IS NULL OR p_linked.name = '')  -- Only fix empty person records+
   LOOP                                                                                   +
     BEGIN                                                                                +
       -- Get the intended person record                                                  +
       SELECT * INTO v_intended_person                                                    +
       FROM people                                                                        +
       WHERE id = v_user.metadata_person_id::uuid;                                        +
                                                                                          +
       -- Get the current empty person record                                             +
       SELECT * INTO v_empty_person                                                       +
       FROM people                                                                        +
       WHERE id = v_user.linked_person_id::uuid;                                          +
                                                                                          +
       IF v_intended_person.id IS NOT NULL AND v_empty_person.id IS NOT NULL THEN         +
         -- Check if intended person is already linked to someone else                    +
         IF v_intended_person.auth_user_id IS NOT NULL THEN                               +
           -- Skip if intended person is already linked                                   +
           v_result := jsonb_build_object(                                                +
             'auth_user_id', v_user.auth_user_id,                                         +
             'action', 'skipped',                                                         +
             'reason', 'intended person already linked',                                  +
             'intended_person_name', v_intended_person.name                               +
           );                                                                             +
         ELSE                                                                             +
           -- Safe to proceed: Link auth user to intended person record                   +
           UPDATE people                                                                  +
           SET                                                                            +
             auth_user_id = v_user.auth_user_id,                                          +
             auth_phone = v_user.auth_phone,                                              +
             verified = true,                                                             +
             updated_at = NOW()                                                           +
           WHERE id = v_intended_person.id;                                               +
                                                                                          +
           -- Remove link from empty person record                                        +
           UPDATE people                                                                  +
           SET                                                                            +
             auth_user_id = NULL,                                                         +
             auth_phone = NULL,                                                           +
             updated_at = NOW()                                                           +
           WHERE id = v_empty_person.id;                                                  +
                                                                                          +
           v_fixed_count := v_fixed_count + 1;                                            +
           v_result := jsonb_build_object(                                                +
             'auth_user_id', v_user.auth_user_id,                                         +
             'action', 'fixed',                                                           +
             'from_person', v_empty_person.id,                                            +
             'to_person', v_intended_person.id,                                           +
             'person_name', v_intended_person.name,                                       +
             'person_phone', v_intended_person.phone                                      +
           );                                                                             +
         END IF;                                                                          +
       ELSE                                                                               +
         v_result := jsonb_build_object(                                                  +
           'auth_user_id', v_user.auth_user_id,                                           +
           'action', 'error',                                                             +
           'reason', 'intended or empty person record not found'                          +
         );                                                                               +
         v_error_count := v_error_count + 1;                                              +
       END IF;                                                                            +
                                                                                          +
       v_results := array_append(v_results, v_result);                                    +
                                                                                          +
     EXCEPTION                                                                            +
       WHEN OTHERS THEN                                                                   +
         v_error_count := v_error_count + 1;                                              +
         v_result := jsonb_build_object(                                                  +
           'auth_user_id', v_user.auth_user_id,                                           +
           'action', 'error',                                                             +
           'error', SQLERRM                                                               +
         );                                                                               +
         v_results := array_append(v_results, v_result);                                  +
     END;                                                                                 +
   END LOOP;                                                                              +
                                                                                          +
   RETURN jsonb_build_object(                                                             +
     'success', true,                                                                     +
     'fixed_count', v_fixed_count,                                                        +
     'error_count', v_error_count,                                                        +
     'total_processed', array_length(v_results, 1),                                       +
     'details', v_results                                                                 +
   );                                                                                     +
 END;                                                                                     +
 $function$                                                                               +
 
(1 row)

