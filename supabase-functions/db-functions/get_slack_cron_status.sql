                                                                pg_get_functiondef                                                                
--------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_slack_cron_status()                                                                                       +
  RETURNS TABLE(job_name text, schedule text, command text, active boolean, last_run timestamp with time zone, next_run timestamp with time zone)+
  LANGUAGE plpgsql                                                                                                                               +
 AS $function$                                                                                                                                   +
  BEGIN                                                                                                                                          +
      RETURN QUERY                                                                                                                               +
      SELECT                                                                                                                                     +
          j.jobname::TEXT,                                                                                                                       +
          j.schedule::TEXT,                                                                                                                      +
          j.command::TEXT,                                                                                                                       +
          j.active,                                                                                                                              +
          j.last_run,                                                                                                                            +
          j.next_run                                                                                                                             +
      FROM cron.job j                                                                                                                            +
      WHERE j.jobname LIKE '%slack%'                                                                                                             +
      ORDER BY j.jobname;                                                                                                                        +
  END;                                                                                                                                           +
  $function$                                                                                                                                     +
 
(1 row)

