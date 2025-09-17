                                           pg_get_functiondef                                           
--------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.slack_queue_health_check()                                          +
  RETURNS TABLE(metric text, count bigint, oldest_pending timestamp with time zone, health_status text)+
  LANGUAGE plpgsql                                                                                     +
  SECURITY DEFINER                                                                                     +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                      +
 AS $function$                                                                                         +
  BEGIN                                                                                                +
    RETURN QUERY                                                                                       +
    SELECT                                                                                             +
      'Total pending notifications'::TEXT,                                                             +
      COUNT(*),                                                                                        +
      MIN(sn.created_at),                                                                              +
      CASE WHEN COUNT(*) > 100 THEN 'WARNING' ELSE 'OK' END                                            +
    FROM slack_notifications sn                                                                        +
    WHERE sn.status = 'pending';                                                                       +
                                                                                                       +
    RETURN QUERY                                                                                       +
    SELECT                                                                                             +
      'Notifications needing lookup'::TEXT,                                                            +
      COUNT(*),                                                                                        +
      MIN(sn.created_at),                                                                              +
      CASE WHEN COUNT(*) > 50 THEN 'WARNING' ELSE 'OK' END                                             +
    FROM slack_notifications sn                                                                        +
    WHERE sn.status = 'pending_lookup';                                                                +
                                                                                                       +
    RETURN QUERY                                                                                       +
    SELECT                                                                                             +
      'Failed notifications'::TEXT,                                                                    +
      COUNT(*),                                                                                        +
      MIN(sn.created_at),                                                                              +
      CASE WHEN COUNT(*) > 10 THEN 'ERROR' ELSE 'OK' END                                               +
    FROM slack_notifications sn                                                                        +
    WHERE sn.status = 'failed';                                                                        +
                                                                                                       +
    RETURN QUERY                                                                                       +
    SELECT                                                                                             +
      'Cached channels (active)'::TEXT,                                                                +
      COUNT(*),                                                                                        +
      MIN(sc.cache_expires_at),                                                                        +
      CASE WHEN COUNT(*) = 0 THEN 'WARNING' ELSE 'OK' END                                              +
    FROM slack_channels sc                                                                             +
    WHERE sc.active = true AND sc.cache_expires_at > NOW();                                            +
  END;                                                                                                 +
  $function$                                                                                           +
 
(1 row)

