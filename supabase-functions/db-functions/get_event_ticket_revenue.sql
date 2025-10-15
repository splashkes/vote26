                             pg_get_functiondef                              
-----------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_event_ticket_revenue(p_event_id uuid)+
  RETURNS numeric                                                           +
  LANGUAGE plpgsql                                                          +
  STABLE SECURITY DEFINER                                                   +
 AS $function$                                                              +
 BEGIN                                                                      +
   RETURN (                                                                 +
     SELECT COALESCE(ticket_revenue, 0)                                     +
     FROM eventbrite_api_cache                                              +
     WHERE event_id = p_event_id                                            +
     ORDER BY fetched_at DESC                                               +
     LIMIT 1                                                                +
   );                                                                       +
 END;                                                                       +
 $function$                                                                 +
 
(1 row)

