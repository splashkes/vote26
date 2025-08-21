                                        pg_get_functiondef                                        
--------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_message_queue_stats()                                     +
  RETURNS TABLE(status text, channel text, count bigint, oldest_message timestamp with time zone)+
  LANGUAGE plpgsql                                                                               +
 AS $function$                                                                                   +
 BEGIN                                                                                           +
   RETURN QUERY                                                                                  +
   SELECT                                                                                        +
     mq.status,                                                                                  +
     mq.channel,                                                                                 +
     COUNT(*),                                                                                   +
     MIN(mq.created_at) as oldest_message                                                        +
   FROM message_queue mq                                                                         +
   GROUP BY mq.status, mq.channel                                                                +
   ORDER BY mq.status, mq.channel;                                                               +
 END;                                                                                            +
 $function$                                                                                      +
 
(1 row)

