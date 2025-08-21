                       pg_get_functiondef                       
----------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.refresh_auction_dashboard() +
  RETURNS void                                                 +
  LANGUAGE plpgsql                                             +
 AS $function$                                                 +
 BEGIN                                                         +
   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_auction_dashboard;+
 END;                                                          +
 $function$                                                    +
 
(1 row)

