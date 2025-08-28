                                            pg_get_functiondef                                            
----------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.check_auth_monitor_cron_status()                                      +
  RETURNS TABLE(jobid integer, jobname text, schedule text, active boolean, database text, username text)+
  LANGUAGE sql                                                                                           +
 AS $function$                                                                                           +
   SELECT                                                                                                +
     j.jobid,                                                                                            +
     j.jobname::text,                                                                                    +
     j.schedule::text,                                                                                   +
     j.active,                                                                                           +
     j.database::text,                                                                                   +
     j.username::text                                                                                    +
   FROM cron.job j                                                                                       +
   WHERE j.jobname = 'auth-monitor-5min';                                                                +
 $function$                                                                                              +
 
(1 row)

