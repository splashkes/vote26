                                                                        pg_get_functiondef                                                                        
------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_cache_invalidation_stats(p_event_eid character varying DEFAULT NULL::character varying, p_minutes_back integer DEFAULT 60)+
  RETURNS TABLE(event_eid character varying, table_name character varying, operation character varying, count bigint, last_invalidation timestamp with time zone)+
  LANGUAGE plpgsql                                                                                                                                               +
 AS $function$                                                                                                                                                   +
 BEGIN                                                                                                                                                           +
   -- This would require storing broadcast history, which we don't by default                                                                                    +
   -- For now, return a message about monitoring setup needed                                                                                                    +
   RAISE NOTICE 'To track cache invalidation stats, implement a broadcast history table';                                                                        +
   RETURN;                                                                                                                                                       +
 END;                                                                                                                                                            +
 $function$                                                                                                                                                      +
 
(1 row)

