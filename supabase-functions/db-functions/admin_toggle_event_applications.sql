                                               pg_get_functiondef                                                
-----------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.admin_toggle_event_applications(p_event_id uuid, p_applications_open boolean)+
  RETURNS void                                                                                                  +
  LANGUAGE plpgsql                                                                                              +
  SECURITY DEFINER                                                                                              +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions', 'realtime'                                   +
 AS $function$                                                                                                  +
 BEGIN                                                                                                          +
   -- Check if user is an active ABHQ admin user                                                                +
   IF NOT EXISTS (                                                                                              +
     SELECT 1                                                                                                   +
     FROM abhq_admin_users                                                                                      +
     WHERE user_id = auth.uid()                                                                                 +
       AND active = true                                                                                        +
   ) AND NOT EXISTS (                                                                                           +
     SELECT 1                                                                                                   +
     FROM abhq_admin_users                                                                                      +
     WHERE email = (auth.jwt() ->> 'email'::text)                                                               +
       AND active = true                                                                                        +
   ) THEN                                                                                                       +
     RAISE EXCEPTION 'Access denied: ABHQ admin permissions required';                                          +
   END IF;                                                                                                      +
                                                                                                                +
   -- Update the applications_open status                                                                       +
   UPDATE events                                                                                                +
   SET                                                                                                          +
     applications_open = p_applications_open,                                                                   +
     updated_at = NOW()                                                                                         +
   WHERE id = p_event_id;                                                                                       +
                                                                                                                +
   -- Check if update was successful                                                                            +
   IF NOT FOUND THEN                                                                                            +
     RAISE EXCEPTION 'Event not found';                                                                         +
   END IF;                                                                                                      +
                                                                                                                +
   -- Log the admin action if audit table exists                                                                +
   BEGIN                                                                                                        +
     INSERT INTO admin_audit_log (                                                                              +
       admin_user_id,                                                                                           +
       event_id,                                                                                                +
       action_type,                                                                                             +
       action_data,                                                                                             +
       created_at                                                                                               +
     ) VALUES (                                                                                                 +
       auth.uid(),                                                                                              +
       p_event_id,                                                                                              +
       'toggle_applications',                                                                                   +
       jsonb_build_object(                                                                                      +
         'applications_open', p_applications_open,                                                              +
         'timestamp', NOW(),                                                                                    +
         'admin_email', (auth.jwt() ->> 'email'::text)                                                          +
       ),                                                                                                       +
       NOW()                                                                                                    +
     );                                                                                                         +
   EXCEPTION                                                                                                    +
     WHEN others THEN                                                                                           +
       -- If audit logging fails, continue anyway (don't block the main operation)                              +
       NULL;                                                                                                    +
   END;                                                                                                         +
                                                                                                                +
 END;                                                                                                           +
 $function$                                                                                                     +
 
(1 row)

