                                                        pg_get_functiondef                                                        
----------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_admin_audit_events(hours_back integer DEFAULT 24)                                         +
  RETURNS TABLE(created_at timestamp with time zone, operation text, user_role text, admin_details text)                         +
  LANGUAGE plpgsql                                                                                                               +
  SECURITY DEFINER                                                                                                               +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                                                +
 AS $function$                                                                                                                   +
  BEGIN                                                                                                                          +
      RETURN QUERY                                                                                                               +
      SELECT                                                                                                                     +
          sal.created_at,                                                                                                        +
          sal.operation,                                                                                                         +
          sal.user_role,                                                                                                         +
          CASE                                                                                                                   +
              WHEN sal.table_name = 'abhq_admin_users' THEN                                                                      +
                  'Admin User: ' || COALESCE(sal.new_data->>'email', sal.old_data->>'email', 'unknown') ||                       +
                  ' - Level: ' || COALESCE(sal.new_data->>'level', sal.old_data->>'level', 'unknown')                            +
              WHEN sal.table_name = 'event_admins' THEN                                                                          +
                  'Event Admin Assignment - Event: ' || COALESCE(sal.new_data->>'event_id', sal.old_data->>'event_id', 'unknown')+
              ELSE sal.table_name || ' operation'                                                                                +
          END as admin_details                                                                                                   +
      FROM security_audit_logs sal                                                                                               +
      WHERE sal.table_name IN ('abhq_admin_users', 'event_admins', 'admin_users')                                                +
      AND sal.created_at > (NOW() - (hours_back || ' hours')::INTERVAL)                                                          +
      ORDER BY sal.created_at DESC;                                                                                              +
  END;                                                                                                                           +
  $function$                                                                                                                     +
 
(1 row)

