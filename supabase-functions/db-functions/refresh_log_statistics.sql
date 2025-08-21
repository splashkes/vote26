                     pg_get_functiondef                     
------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.refresh_log_statistics()+
  RETURNS void                                             +
  LANGUAGE plpgsql                                         +
 AS $function$                                             +
 BEGIN                                                     +
     REFRESH MATERIALIZED VIEW CONCURRENTLY log_statistics;+
 END;                                                      +
 $function$                                                +
 
(1 row)

