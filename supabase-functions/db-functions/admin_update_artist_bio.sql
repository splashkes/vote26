                                       pg_get_functiondef                                        
-------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.admin_update_artist_bio(p_artist_profile_id uuid, p_bio text)+
  RETURNS boolean                                                                               +
  LANGUAGE plpgsql                                                                              +
  SECURITY DEFINER                                                                              +
 AS $function$                                                                                  +
 DECLARE                                                                                        +
   v_updated_rows INTEGER;                                                                      +
 BEGIN                                                                                          +
   -- Validate bio length (max 2000 characters)                                                 +
   IF LENGTH(p_bio) > 2000 THEN                                                                 +
     RAISE EXCEPTION 'Bio cannot exceed 2000 characters';                                       +
   END IF;                                                                                      +
                                                                                                +
   -- Update the bio                                                                            +
   UPDATE artist_profiles                                                                       +
   SET                                                                                          +
     abhq_bio = CASE                                                                            +
       WHEN TRIM(p_bio) = '' THEN NULL                                                          +
       ELSE TRIM(p_bio)                                                                         +
     END,                                                                                       +
     updated_at = NOW()                                                                         +
   WHERE id = p_artist_profile_id;                                                              +
                                                                                                +
   GET DIAGNOSTICS v_updated_rows = ROW_COUNT;                                                  +
                                                                                                +
   IF v_updated_rows = 0 THEN                                                                   +
     RAISE EXCEPTION 'Artist profile not found or not updated';                                 +
   END IF;                                                                                      +
                                                                                                +
   RETURN TRUE;                                                                                 +
 END;                                                                                           +
 $function$                                                                                     +
 
(1 row)

