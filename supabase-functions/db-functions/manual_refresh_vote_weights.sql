                                             pg_get_functiondef                                              
-------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.manual_refresh_vote_weights()                                            +
  RETURNS text                                                                                              +
  LANGUAGE plpgsql                                                                                          +
 AS $function$                                                                                              +
  DECLARE                                                                                                   +
    start_time TIMESTAMP;                                                                                   +
    end_time TIMESTAMP;                                                                                     +
    row_count INT;                                                                                          +
  BEGIN                                                                                                     +
    start_time := clock_timestamp();                                                                        +
                                                                                                            +
    -- Refresh the materialized view                                                                        +
    REFRESH MATERIALIZED VIEW CONCURRENTLY person_vote_weights;                                             +
                                                                                                            +
    end_time := clock_timestamp();                                                                          +
                                                                                                            +
    -- Get row count                                                                                        +
    SELECT COUNT(*) INTO row_count FROM person_vote_weights;                                                +
                                                                                                            +
    -- Log the refresh using existing system_logs structure                                                 +
    INSERT INTO system_logs (                                                                               +
      service,                                                                                              +
      operation,                                                                                            +
      level,                                                                                                +
      message,                                                                                              +
      request_data,                                                                                         +
      duration_ms,                                                                                          +
      timestamp                                                                                             +
    ) VALUES (                                                                                              +
      'vote_weights',                                                                                       +
      'refresh_materialized_view',                                                                          +
      'info',                                                                                               +
      format('Vote weights refreshed: %s rows', row_count),                                                 +
      jsonb_build_object(                                                                                   +
        'start_time', start_time,                                                                           +
        'end_time', end_time,                                                                               +
        'row_count', row_count                                                                              +
      ),                                                                                                    +
      EXTRACT(EPOCH FROM (end_time - start_time)) * 1000,                                                   +
      NOW()                                                                                                 +
    );                                                                                                      +
                                                                                                            +
    RETURN format('Vote weights refreshed successfully: %s rows in %s', row_count, (end_time - start_time));+
  END;                                                                                                      +
  $function$                                                                                                +
 
(1 row)

