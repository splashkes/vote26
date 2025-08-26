                        pg_get_functiondef                        
------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.pause_slack_queue_processing()+
  RETURNS text                                                   +
  LANGUAGE plpgsql                                               +
  SECURITY DEFINER                                               +
 AS $function$                                                   +
 BEGIN                                                           +
     UPDATE cron.job                                             +
     SET active = false                                          +
     WHERE jobname = 'process-slack-queue-every-minute';         +
                                                                 +
     RETURN 'Slack queue processing paused';                     +
 END;                                                            +
 $function$                                                      +
 
(1 row)

