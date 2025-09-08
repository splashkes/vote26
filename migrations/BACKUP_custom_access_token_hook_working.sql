                                    pg_get_functiondef                                     
-------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)                  +
  RETURNS jsonb                                                                           +
  LANGUAGE plpgsql                                                                        +
  SECURITY DEFINER                                                                        +
 AS $function$                                                                            +
 DECLARE                                                                                  +
     claims jsonb;                                                                        +
     user_id text;                                                                        +
     person_data record;                                                                  +
 BEGIN                                                                                    +
     -- Extract user_id and claims from event                                             +
     user_id := event->>'user_id';                                                        +
     claims := event->'claims';                                                           +
                                                                                          +
     -- Query person data linked to this auth user (with full schema qualification)       +
     SELECT id, name, hash, verified, phone INTO person_data                              +
     FROM public.people                                                                   +
     WHERE auth_user_id = user_id::uuid;                                                  +
                                                                                          +
     IF FOUND THEN                                                                        +
         -- Person found - inject person data into JWT claims                             +
         claims := jsonb_set(claims, '{person_id}', to_jsonb(person_data.id::text));      +
         claims := jsonb_set(claims, '{person_hash}', to_jsonb(person_data.hash));        +
         claims := jsonb_set(claims, '{person_name}', to_jsonb(person_data.name));        +
         claims := jsonb_set(claims, '{person_verified}', to_jsonb(person_data.verified));+
         claims := jsonb_set(claims, '{auth_version}', '"v2-http"');                      +
         claims := jsonb_set(claims, '{person_pending}', 'false');                        +
     ELSE                                                                                 +
         -- No person found - person creation pending                                     +
         claims := jsonb_set(claims, '{person_id}', 'null');                              +
         claims := jsonb_set(claims, '{auth_version}', '"v2-http"');                      +
         claims := jsonb_set(claims, '{person_pending}', 'true');                         +
     END IF;                                                                              +
                                                                                          +
     RETURN jsonb_build_object('claims', claims);                                         +
 EXCEPTION                                                                                +
     WHEN OTHERS THEN                                                                     +
         -- If anything fails, just return original claims with auth_version              +
         claims := jsonb_set(claims, '{auth_version}', '"v2-http"');                      +
         claims := jsonb_set(claims, '{person_pending}', 'true');                         +
         claims := jsonb_set(claims, '{hook_error}', to_jsonb(SQLERRM));                  +
         RETURN jsonb_build_object('claims', claims);                                     +
 END;                                                                                     +
 $function$                                                                               +
 
(1 row)

