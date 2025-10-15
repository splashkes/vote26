                              pg_get_functiondef                              
------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_event_auction_revenue(p_event_id uuid)+
  RETURNS numeric                                                            +
  LANGUAGE plpgsql                                                           +
  STABLE SECURITY DEFINER                                                    +
 AS $function$                                                               +
 BEGIN                                                                       +
   RETURN (                                                                  +
     SELECT COALESCE(SUM(final_price), 0)                                    +
     FROM art                                                                +
     WHERE event_id = p_event_id                                             +
       AND final_price IS NOT NULL                                           +
       AND final_price > 0                                                   +
   );                                                                        +
 END;                                                                        +
 $function$                                                                  +
 
(1 row)

