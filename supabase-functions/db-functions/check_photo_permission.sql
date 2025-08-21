                                      pg_get_functiondef                                      
----------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.check_photo_permission(p_event_id uuid, p_user_phone text)+
  RETURNS boolean                                                                            +
  LANGUAGE plpgsql                                                                           +
  SECURITY DEFINER                                                                           +
 AS $function$                                                                               +
 DECLARE                                                                                     +
     v_has_permission BOOLEAN := false;                                                      +
 BEGIN                                                                                       +
     -- Check if user has photo, producer, or super admin level for this event               +
     SELECT EXISTS (                                                                         +
         SELECT 1                                                                            +
         FROM event_admins ea                                                                +
         JOIN people p ON ea.person_id = p.id                                                +
         WHERE ea.event_id = p_event_id                                                      +
           AND p.phone_number = p_user_phone                                                 +
           AND ea.admin_level IN ('photo', 'producer', 'super')                              +
     ) INTO v_has_permission;                                                                +
                                                                                             +
     RETURN v_has_permission;                                                                +
 END;                                                                                        +
 $function$                                                                                  +
 
(1 row)

