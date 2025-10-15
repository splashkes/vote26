                              pg_get_functiondef                               
-------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_event_ticket_revenue_by_eid(p_eid text)+
  RETURNS numeric                                                             +
  LANGUAGE plpgsql                                                            +
  STABLE SECURITY DEFINER                                                     +
 AS $function$                                                                +
 BEGIN                                                                        +
   RETURN (                                                                   +
     SELECT COALESCE(ticket_revenue, 0)                                       +
     FROM eventbrite_api_cache eac                                            +
     WHERE eac.eid = p_eid                                                    +
     ORDER BY fetched_at DESC                                                 +
     LIMIT 1                                                                  +
   );                                                                         +
 END;                                                                         +
 $function$                                                                   +
 
(1 row)

