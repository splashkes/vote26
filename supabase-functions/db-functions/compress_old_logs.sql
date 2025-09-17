                                  pg_get_functiondef                                  
--------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.compress_old_logs()                               +
  RETURNS void                                                                       +
  LANGUAGE plpgsql                                                                   +
 AS $function$                                                                       +
  DECLARE                                                                            +
      batch_size INTEGER := 1000;                                                    +
      compressed_count INTEGER := 0;                                                 +
  BEGIN                                                                              +
      -- Compress logs older than 24 hours                                           +
      -- This is a placeholder - actual compression would be done in application code+
      -- as PostgreSQL doesn't have built-in gzip support                            +
                                                                                     +
      -- For now, just delete very old logs                                          +
      DELETE FROM system_logs                                                        +
      WHERE timestamp < NOW() - INTERVAL '30 days'                                   +
      AND id NOT IN (                                                                +
          SELECT id FROM system_logs                                                 +
          WHERE timestamp < NOW() - INTERVAL '30 days'                               +
          ORDER BY timestamp DESC                                                    +
          LIMIT 1000  -- Keep last 1000 old logs for reference                       +
      );                                                                             +
                                                                                     +
      -- Clean up compressed logs                                                    +
      DELETE FROM system_logs_compressed                                             +
      WHERE expires_at < NOW();                                                      +
  END;                                                                               +
  $function$                                                                         +
 
(1 row)

