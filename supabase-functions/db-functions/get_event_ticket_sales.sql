                            pg_get_functiondef                             
---------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_event_ticket_sales(p_event_id uuid)+
  RETURNS integer                                                         +
  LANGUAGE plpgsql                                                        +
  STABLE SECURITY DEFINER                                                 +
 AS $function$                                                            +
 BEGIN                                                                    +
   RETURN (                                                               +
     SELECT COALESCE(total_tickets_sold, 0)                               +
     FROM eventbrite_api_cache                                            +
     WHERE event_id = p_event_id                                          +
     ORDER BY fetched_at DESC                                             +
     LIMIT 1                                                              +
   );                                                                     +
 END;                                                                     +
 $function$                                                               +
 
(1 row)

