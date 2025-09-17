                                                             pg_get_functiondef                                                              
---------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_recent_audit_events(hours_back integer DEFAULT 24)                                                   +
  RETURNS TABLE(created_at timestamp with time zone, table_name text, operation text, user_role text, function_name text, data_summary text)+
  LANGUAGE plpgsql                                                                                                                          +
  SECURITY DEFINER                                                                                                                          +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                                                           +
 AS $function$                                                                                                                              +
 BEGIN                                                                                                                                      +
     -- Security check: Only users with admin_events containing special 'SUPER_ADMIN' key can access audit logs                             +
     -- This is set in the custom access token hook for super admins only                                                                   +
     IF NOT (                                                                                                                               +
         auth.jwt() ->> 'role' = 'authenticated'                                                                                            +
         AND auth.jwt() -> 'admin_events' ? 'SUPER_ADMIN'                                                                                   +
     ) THEN                                                                                                                                 +
         RAISE EXCEPTION 'Access denied: Super admin privileges required for audit logs';                                                   +
     END IF;                                                                                                                                +
                                                                                                                                            +
     RETURN QUERY                                                                                                                           +
     SELECT                                                                                                                                 +
         sal.created_at,                                                                                                                    +
         sal.table_name,                                                                                                                    +
         sal.operation,                                                                                                                     +
         sal.user_role,                                                                                                                     +
         sal.function_name,                                                                                                                 +
         CASE                                                                                                                               +
             WHEN sal.new_data IS NOT NULL THEN 'New: ' || LEFT(sal.new_data::text, 100)                                                    +
             WHEN sal.old_data IS NOT NULL THEN 'Old: ' || LEFT(sal.old_data::text, 100)                                                    +
             ELSE 'No data'                                                                                                                 +
         END as data_summary                                                                                                                +
     FROM security_audit_logs sal                                                                                                           +
     WHERE sal.created_at > (NOW() - (hours_back || ' hours')::INTERVAL)                                                                    +
     ORDER BY sal.created_at DESC;                                                                                                          +
 END;                                                                                                                                       +
 $function$                                                                                                                                 +
 
(1 row)

