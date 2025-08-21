                                              pg_get_functiondef                                              
--------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.test_vote_debug(p_eid character varying, p_round integer, p_easel integer)+
  RETURNS jsonb                                                                                              +
  LANGUAGE plpgsql                                                                                           +
  SECURITY DEFINER                                                                                           +
 AS $function$                                                                                               +
 DECLARE                                                                                                     +
   v_auth_user_id UUID;                                                                                      +
   v_person_id UUID;                                                                                         +
   v_event_id UUID;                                                                                          +
   v_art_uuid UUID;                                                                                          +
   v_test_step TEXT := 'start';                                                                              +
 BEGIN                                                                                                       +
   v_test_step := 'auth_check';                                                                              +
   v_auth_user_id := auth.uid();                                                                             +
                                                                                                             +
   IF v_auth_user_id IS NULL THEN                                                                            +
     RETURN jsonb_build_object('success', false, 'error', 'Authentication required', 'step', v_test_step);   +
   END IF;                                                                                                   +
                                                                                                             +
   v_test_step := 'event_lookup';                                                                            +
   SELECT id INTO v_event_id FROM events WHERE eid = p_eid;                                                  +
                                                                                                             +
   IF v_event_id IS NULL THEN                                                                                +
     RETURN jsonb_build_object('success', false, 'error', 'Event not found', 'step', v_test_step);           +
   END IF;                                                                                                   +
                                                                                                             +
   v_test_step := 'art_lookup';                                                                              +
   SELECT id INTO v_art_uuid FROM art WHERE event_id = v_event_id AND round = p_round AND easel = p_easel;   +
                                                                                                             +
   IF v_art_uuid IS NULL THEN                                                                                +
     RETURN jsonb_build_object('success', false, 'error', 'Artwork not found', 'step', v_test_step);         +
   END IF;                                                                                                   +
                                                                                                             +
   v_test_step := 'person_lookup';                                                                           +
   SELECT id INTO v_person_id FROM people WHERE auth_user_id = v_auth_user_id;                               +
                                                                                                             +
   IF v_person_id IS NULL THEN                                                                               +
     RETURN jsonb_build_object('success', false, 'error', 'Person not found', 'step', v_test_step);          +
   END IF;                                                                                                   +
                                                                                                             +
   v_test_step := 'vote_check';                                                                              +
   -- This is where the error might be happening                                                             +
   PERFORM id FROM votes WHERE art_uuid = v_art_uuid AND person_id = v_person_id;                            +
                                                                                                             +
   RETURN jsonb_build_object(                                                                                +
     'success', true,                                                                                        +
     'step', v_test_step,                                                                                    +
     'auth_user_id', v_auth_user_id,                                                                         +
     'event_id', v_event_id,                                                                                 +
     'art_uuid', v_art_uuid,                                                                                 +
     'person_id', v_person_id                                                                                +
   );                                                                                                        +
                                                                                                             +
 EXCEPTION                                                                                                   +
   WHEN OTHERS THEN                                                                                          +
     RETURN jsonb_build_object(                                                                              +
       'success', false,                                                                                     +
       'error', 'Error at step: ' || v_test_step,                                                            +
       'detail', SQLERRM,                                                                                    +
       'step', v_test_step                                                                                   +
     );                                                                                                      +
 END;                                                                                                        +
 $function$                                                                                                  +
 
(1 row)

