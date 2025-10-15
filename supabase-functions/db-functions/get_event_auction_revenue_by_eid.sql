                               pg_get_functiondef                               
--------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_event_auction_revenue_by_eid(p_eid text)+
  RETURNS numeric                                                              +
  LANGUAGE plpgsql                                                             +
  STABLE SECURITY DEFINER                                                      +
 AS $function$                                                                 +
 BEGIN                                                                         +
   RETURN (                                                                    +
     SELECT COALESCE(SUM(a.final_price), 0)                                    +
     FROM art a                                                                +
     INNER JOIN events e ON a.event_id = e.id                                  +
     WHERE e.eid = p_eid                                                       +
       AND a.final_price IS NOT NULL                                           +
       AND a.final_price > 0                                                   +
   );                                                                          +
 END;                                                                          +
 $function$                                                                    +
 
(1 row)

