                                                     pg_get_functiondef                                                      
-----------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_realtime_queue_stats()                                                               +
  RETURNS TABLE(metric_name text, metric_value bigint, metric_unit text, last_updated timestamp with time zone, status text)+
  LANGUAGE plpgsql                                                                                                          +
  SECURITY DEFINER                                                                                                          +
 AS $function$                                                                                                              +
 DECLARE                                                                                                                    +
   wal_lag bigint := 0;                                                                                                     +
   slot_count int := 0;                                                                                                     +
   active_connections int := 0;                                                                                             +
 BEGIN                                                                                                                      +
   -- Get WAL lag (indicates message backup in queue)                                                                       +
   SELECT COALESCE(                                                                                                         +
     pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn), 0                                                          +
   ) INTO wal_lag                                                                                                           +
   FROM pg_replication_slots                                                                                                +
   WHERE slot_name LIKE 'supabase_realtime%'                                                                                +
   AND active = true                                                                                                        +
   LIMIT 1;                                                                                                                 +
                                                                                                                            +
   -- Count active replication slots                                                                                        +
   SELECT COUNT(*) INTO slot_count                                                                                          +
   FROM pg_replication_slots                                                                                                +
   WHERE slot_name LIKE 'supabase_realtime%'                                                                                +
   AND active = true;                                                                                                       +
                                                                                                                            +
   -- Get active realtime connections                                                                                       +
   SELECT COUNT(*) INTO active_connections                                                                                  +
   FROM pg_stat_activity                                                                                                    +
   WHERE application_name LIKE '%realtime%'                                                                                 +
   AND state = 'active';                                                                                                    +
                                                                                                                            +
   -- Return metrics                                                                                                        +
   RETURN QUERY VALUES                                                                                                      +
     ('wal_lag_bytes', wal_lag, 'bytes', now(),                                                                             +
      CASE WHEN wal_lag > 10485760 THEN 'CRITICAL'                                                                          +
           WHEN wal_lag > 1048576 THEN 'WARNING'                                                                            +
           ELSE 'OK' END),                                                                                                  +
     ('active_slots', slot_count::bigint, 'count', now(),                                                                   +
      CASE WHEN slot_count = 0 THEN 'CRITICAL'                                                                              +
           WHEN slot_count > 5 THEN 'WARNING'                                                                               +
           ELSE 'OK' END),                                                                                                  +
     ('active_connections', active_connections::bigint, 'count', now(),                                                     +
      CASE WHEN active_connections = 0 THEN 'WARNING'                                                                       +
           WHEN active_connections > 100 THEN 'WARNING'                                                                     +
           ELSE 'OK' END);                                                                                                  +
 END;                                                                                                                       +
 $function$                                                                                                                 +
 
(1 row)

