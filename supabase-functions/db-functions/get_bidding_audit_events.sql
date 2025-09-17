                                          pg_get_functiondef                                           
-------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_bidding_audit_events(hours_back integer DEFAULT 24)            +
  RETURNS TABLE(created_at timestamp with time zone, operation text, user_role text, bid_details text)+
  LANGUAGE plpgsql                                                                                    +
  SECURITY DEFINER                                                                                    +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                     +
 AS $function$                                                                                        +
  BEGIN                                                                                               +
      RETURN QUERY                                                                                    +
      SELECT                                                                                          +
          sal.created_at,                                                                             +
          sal.operation,                                                                              +
          sal.user_role,                                                                              +
          CASE                                                                                        +
              WHEN sal.table_name = 'bids' THEN                                                       +
                  'Bid $' || COALESCE(sal.new_data->>'amount', sal.old_data->>'amount', '0') ||       +
                  ' on art ' || COALESCE(sal.new_data->>'art_id', sal.old_data->>'art_id', 'unknown') +
              ELSE sal.table_name || ' operation'                                                     +
          END as bid_details                                                                          +
      FROM security_audit_logs sal                                                                    +
      WHERE sal.table_name = 'bids'                                                                   +
      AND sal.created_at > (NOW() - (hours_back || ' hours')::INTERVAL)                               +
      ORDER BY sal.created_at DESC;                                                                   +
  END;                                                                                                +
  $function$                                                                                          +
 
(1 row)

