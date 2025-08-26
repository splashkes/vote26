                        pg_get_functiondef                         
-------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.resume_slack_queue_processing()+
  RETURNS text                                                    +
  LANGUAGE plpgsql                                                +
  SECURITY DEFINER                                                +
 AS $function$                                                    +
 BEGIN                                                            +
     UPDATE cron.job                                              +
     SET active = true                                            +
     WHERE jobname = 'process-slack-queue-every-minute';          +
                                                                  +
     RETURN 'Slack queue processing resumed';                     +
 END;                                                             +
 $function$                                                       +
 
(1 row)

