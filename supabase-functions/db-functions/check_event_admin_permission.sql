                                                                                            pg_get_functiondef                                                                                             
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.check_event_admin_permission(p_event_id uuid, p_required_level text, p_user_id uuid DEFAULT auth.uid(), p_user_phone character varying DEFAULT NULL::character varying)+
  RETURNS boolean                                                                                                                                                                                         +
  LANGUAGE plpgsql                                                                                                                                                                                        +
  SECURITY DEFINER                                                                                                                                                                                        +
  SET search_path TO 'pg_catalog', 'public'                                                                                                                                                               +
 AS $function$                                                                                                                                                                                            +
  DECLARE                                                                                                                                                                                                 +
      v_user_phone VARCHAR(20);                                                                                                                                                                           +
      v_user_level VARCHAR(20);                                                                                                                                                                           +
      v_normalized_phone VARCHAR(20);                                                                                                                                                                     +
  BEGIN                                                                                                                                                                                                   +
      -- Get phone from authenticated user if not provided                                                                                                                                                +
      IF p_user_phone IS NULL AND auth.uid() IS NOT NULL THEN                                                                                                                                             +
          -- Try JWT first                                                                                                                                                                                +
          v_user_phone := auth.jwt()->>'phone';                                                                                                                                                           +
                                                                                                                                                                                                          +
          -- If not in JWT, get from people table                                                                                                                                                         +
          IF v_user_phone IS NULL THEN                                                                                                                                                                    +
              SELECT phone INTO v_user_phone                                                                                                                                                              +
              FROM people                                                                                                                                                                                 +
              WHERE id = auth.uid()                                                                                                                                                                       +
              LIMIT 1;                                                                                                                                                                                    +
          END IF;                                                                                                                                                                                         +
      ELSE                                                                                                                                                                                                +
          v_user_phone := p_user_phone;                                                                                                                                                                   +
      END IF;                                                                                                                                                                                             +
                                                                                                                                                                                                          +
      -- Normalize phone (remove + if present)                                                                                                                                                            +
      IF v_user_phone IS NOT NULL THEN                                                                                                                                                                    +
          v_normalized_phone := regexp_replace(v_user_phone, '^\+', '', 'g');                                                                                                                             +
                                                                                                                                                                                                          +
          -- Check event_admins table                                                                                                                                                                     +
          SELECT admin_level INTO v_user_level                                                                                                                                                            +
          FROM event_admins                                                                                                                                                                               +
          WHERE event_id = p_event_id                                                                                                                                                                     +
          AND (phone = v_user_phone OR phone = v_normalized_phone OR phone = '+' || v_normalized_phone)                                                                                                   +
          LIMIT 1;                                                                                                                                                                                        +
                                                                                                                                                                                                          +
          -- Check if user level meets required level                                                                                                                                                     +
          IF v_user_level IS NOT NULL THEN                                                                                                                                                                +
              CASE p_required_level                                                                                                                                                                       +
                  WHEN 'voting' THEN                                                                                                                                                                      +
                      RETURN v_user_level IN ('voting', 'photo', 'producer', 'super');                                                                                                                    +
                  WHEN 'photo' THEN                                                                                                                                                                       +
                      RETURN v_user_level IN ('photo', 'producer', 'super');                                                                                                                              +
                  WHEN 'producer' THEN                                                                                                                                                                    +
                      RETURN v_user_level IN ('producer', 'super');                                                                                                                                       +
                  WHEN 'super' THEN                                                                                                                                                                       +
                      RETURN v_user_level = 'super';                                                                                                                                                      +
                  ELSE                                                                                                                                                                                    +
                      RETURN FALSE;                                                                                                                                                                       +
              END CASE;                                                                                                                                                                                   +
          END IF;                                                                                                                                                                                         +
      END IF;                                                                                                                                                                                             +
                                                                                                                                                                                                          +
      RETURN FALSE;                                                                                                                                                                                       +
  END;                                                                                                                                                                                                    +
  $function$                                                                                                                                                                                              +
 
(1 row)

