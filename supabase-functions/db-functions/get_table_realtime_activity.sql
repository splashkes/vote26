                                                                 pg_get_functiondef                                                                  
-----------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_table_realtime_activity()                                                                                    +
  RETURNS TABLE(table_name text, total_changes bigint, recent_changes bigint, avg_change_size numeric, last_change_time timestamp without time zone)+
  LANGUAGE plpgsql                                                                                                                                  +
  SECURITY DEFINER                                                                                                                                  +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                                                                   +
 AS $function$                                                                                                                                      +
  BEGIN                                                                                                                                             +
    -- Note: This function provides estimated metrics based on pg_stat_user_tables                                                                  +
    -- For precise realtime metrics, you'd need to implement custom tracking                                                                        +
                                                                                                                                                    +
    RETURN QUERY                                                                                                                                    +
    SELECT                                                                                                                                          +
      schemaname || '.' || relname as table_name,                                                                                                   +
      n_tup_ins + n_tup_upd + n_tup_del as total_changes,                                                                                           +
      -- Estimate recent changes (this is approximate)                                                                                              +
      CASE                                                                                                                                          +
        WHEN last_autoanalyze > now() - interval '1 hour'                                                                                           +
        THEN (n_tup_ins + n_tup_upd + n_tup_del) / 10                                                                                               +
        ELSE 0                                                                                                                                      +
      END as recent_changes,                                                                                                                        +
      -- Average tuple size estimate                                                                                                                +
      CASE                                                                                                                                          +
        WHEN n_live_tup > 0                                                                                                                         +
        THEN pg_total_relation_size(schemaname||'.'||relname)::numeric / n_live_tup                                                                 +
        ELSE 0                                                                                                                                      +
      END as avg_change_size,                                                                                                                       +
      GREATEST(last_vacuum, last_autovacuum, last_analyze, last_autoanalyze) as last_change_time                                                    +
    FROM pg_stat_user_tables                                                                                                                        +
    WHERE schemaname = 'public'                                                                                                                     +
    AND relname IN ('art', 'bids', 'votes', 'round_contestants')                                                                                    +
    ORDER BY total_changes DESC;                                                                                                                    +
  END;                                                                                                                                              +
  $function$                                                                                                                                        +
 
(1 row)

