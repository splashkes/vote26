                                                                                               pg_get_functiondef                                                                                               
----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.log_security_event(p_table_name text, p_operation text, p_old_data jsonb DEFAULT NULL::jsonb, p_new_data jsonb DEFAULT NULL::jsonb, p_function_name text DEFAULT NULL::text)+
  RETURNS void                                                                                                                                                                                                 +
  LANGUAGE plpgsql                                                                                                                                                                                             +
  SECURITY DEFINER                                                                                                                                                                                             +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                                                                                                                              +
 AS $function$                                                                                                                                                                                                 +
  BEGIN                                                                                                                                                                                                        +
      INSERT INTO security_audit_logs (                                                                                                                                                                        +
          table_name,                                                                                                                                                                                          +
          operation,                                                                                                                                                                                           +
          user_id,                                                                                                                                                                                             +
          user_role,                                                                                                                                                                                           +
          old_data,                                                                                                                                                                                            +
          new_data,                                                                                                                                                                                            +
          function_name                                                                                                                                                                                        +
      ) VALUES (                                                                                                                                                                                               +
          p_table_name,                                                                                                                                                                                        +
          p_operation,                                                                                                                                                                                         +
          auth.uid(),                                                                                                                                                                                          +
          CASE                                                                                                                                                                                                 +
              WHEN auth.uid() IN (SELECT user_id FROM abhq_admin_users WHERE active = true) THEN 'admin'                                                                                                       +
              WHEN auth.uid() IS NOT NULL THEN 'authenticated'                                                                                                                                                 +
              ELSE 'anonymous'                                                                                                                                                                                 +
          END,                                                                                                                                                                                                 +
          p_old_data,                                                                                                                                                                                          +
          p_new_data,                                                                                                                                                                                          +
          p_function_name                                                                                                                                                                                      +
      );                                                                                                                                                                                                       +
  END;                                                                                                                                                                                                         +
  $function$                                                                                                                                                                                                   +
 
(1 row)

