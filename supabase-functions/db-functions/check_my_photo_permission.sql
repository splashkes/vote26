                              pg_get_functiondef                              
------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.check_my_photo_permission(p_event_id uuid)+
  RETURNS boolean                                                            +
  LANGUAGE plpgsql                                                           +
  SECURITY DEFINER                                                           +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'            +
 AS $function$                                                               +
  DECLARE                                                                    +
      v_user_phone TEXT;                                                     +
      v_has_permission BOOLEAN := false;                                     +
  BEGIN                                                                      +
      -- Get the current user's phone                                        +
      SELECT phone INTO v_user_phone                                         +
      FROM auth.users                                                        +
      WHERE id = auth.uid();                                                 +
                                                                             +
      IF v_user_phone IS NULL THEN                                           +
          RETURN false;                                                      +
      END IF;                                                                +
                                                                             +
      -- Use the main function                                               +
      RETURN check_photo_permission(p_event_id, v_user_phone);               +
  END;                                                                       +
  $function$                                                                 +
 
(1 row)

