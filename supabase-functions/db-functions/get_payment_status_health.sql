                                                        pg_get_functiondef                                                        
----------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_payment_status_health()                                                                   +
  RETURNS TABLE(status_category text, count integer, oldest_payment timestamp with time zone, alert_level text, description text)+
  LANGUAGE plpgsql                                                                                                               +
  SECURITY DEFINER                                                                                                               +
 AS $function$                                                                                                                   +
 BEGIN                                                                                                                           +
     RETURN QUERY                                                                                                                +
     -- Payments stuck in processing (> 5 minutes)                                                                               +
     SELECT                                                                                                                      +
         'stuck_processing'::text,                                                                                               +
         COUNT(*)::integer,                                                                                                      +
         MIN(created_at),                                                                                                        +
         CASE WHEN COUNT(*) > 0 THEN 'HIGH' ELSE 'OK' END::text,                                                                 +
         'Payments stuck in processing status > 5 minutes'::text                                                                 +
     FROM artist_payments                                                                                                        +
     WHERE status = 'processing'                                                                                                 +
       AND created_at < NOW() - INTERVAL '5 minutes'                                                                             +
                                                                                                                                 +
     UNION ALL                                                                                                                   +
                                                                                                                                 +
     -- Payments stuck in paid (> 10 minutes - missing webhook)                                                                  +
     SELECT                                                                                                                      +
         'missing_webhook'::text,                                                                                                +
         COUNT(*)::integer,                                                                                                      +
         MIN(created_at),                                                                                                        +
         CASE WHEN COUNT(*) > 0 THEN 'MEDIUM' ELSE 'OK' END::text,                                                               +
         'Payments in paid status > 10 minutes (awaiting webhook)'::text                                                         +
     FROM artist_payments                                                                                                        +
     WHERE status = 'paid'                                                                                                       +
       AND created_at < NOW() - INTERVAL '10 minutes'                                                                            +
                                                                                                                                 +
     UNION ALL                                                                                                                   +
                                                                                                                                 +
     -- Recent verified payments (last hour)                                                                                     +
     SELECT                                                                                                                      +
         'recent_verified'::text,                                                                                                +
         COUNT(*)::integer,                                                                                                      +
         MIN(webhook_confirmed_at),                                                                                              +
         'INFO'::text,                                                                                                           +
         'Recently verified payments (last hour)'::text                                                                          +
     FROM artist_payments                                                                                                        +
     WHERE status = 'verified'                                                                                                   +
       AND webhook_confirmed_at > NOW() - INTERVAL '1 hour'                                                                      +
                                                                                                                                 +
     UNION ALL                                                                                                                   +
                                                                                                                                 +
     -- Failed payments (last 24 hours)                                                                                          +
     SELECT                                                                                                                      +
         'recent_failures'::text,                                                                                                +
         COUNT(*)::integer,                                                                                                      +
         MIN(created_at),                                                                                                        +
         CASE WHEN COUNT(*) > 5 THEN 'HIGH' WHEN COUNT(*) > 0 THEN 'MEDIUM' ELSE 'OK' END::text,                                 +
         'Failed payments in last 24 hours'::text                                                                                +
     FROM artist_payments                                                                                                        +
     WHERE status = 'failed'                                                                                                     +
       AND created_at > NOW() - INTERVAL '24 hours';                                                                             +
 END;                                                                                                                            +
 $function$                                                                                                                      +
 
(1 row)

