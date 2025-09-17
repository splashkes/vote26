                                                  pg_get_functiondef                                                   
-----------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_payment_audit_events(hours_back integer DEFAULT 24)                            +
  RETURNS TABLE(created_at timestamp with time zone, operation text, user_role text, payment_details text)            +
  LANGUAGE plpgsql                                                                                                    +
  SECURITY DEFINER                                                                                                    +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                                     +
 AS $function$                                                                                                        +
  BEGIN                                                                                                               +
      RETURN QUERY                                                                                                    +
      SELECT                                                                                                          +
          sal.created_at,                                                                                             +
          sal.operation,                                                                                              +
          sal.user_role,                                                                                              +
          CASE                                                                                                        +
              WHEN sal.table_name = 'payment_processing' THEN                                                         +
                  'Payment $' || COALESCE(sal.new_data->>'amount', sal.old_data->>'amount', '0') ||                   +
                  ' - Status: ' || COALESCE(sal.new_data->>'status', sal.old_data->>'status', 'unknown')              +
              WHEN sal.table_name = 'artist_payments' THEN                                                            +
                  'Artist Payment - Status: ' || COALESCE(sal.new_data->>'status', sal.old_data->>'status', 'unknown')+
              ELSE sal.table_name || ' operation'                                                                     +
          END as payment_details                                                                                      +
      FROM security_audit_logs sal                                                                                    +
      WHERE sal.table_name IN ('payment_processing', 'artist_payments', 'artist_global_payments')                     +
      AND sal.created_at > (NOW() - (hours_back || ' hours')::INTERVAL)                                               +
      ORDER BY sal.created_at DESC;                                                                                   +
  END;                                                                                                                +
  $function$                                                                                                          +
 
(1 row)

