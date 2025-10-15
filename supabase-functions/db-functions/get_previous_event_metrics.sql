                                                                        pg_get_functiondef                                                                         
-------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_previous_event_metrics(p_event_id uuid)                                                                                    +
  RETURNS TABLE(prev_event_id uuid, prev_eid text, prev_ticket_revenue numeric, prev_auction_revenue numeric, prev_total_votes integer, prev_ticket_sales integer)+
  LANGUAGE plpgsql                                                                                                                                                +
  STABLE SECURITY DEFINER                                                                                                                                         +
 AS $function$                                                                                                                                                    +
 DECLARE                                                                                                                                                          +
   v_city_id INTEGER;                                                                                                                                             +
   v_event_date TIMESTAMP;                                                                                                                                        +
 BEGIN                                                                                                                                                            +
   SELECT city_id, event_start_datetime INTO v_city_id, v_event_date                                                                                              +
   FROM events                                                                                                                                                    +
   WHERE id = p_event_id;                                                                                                                                         +
                                                                                                                                                                  +
   RETURN QUERY                                                                                                                                                   +
   WITH prev_event AS (                                                                                                                                           +
     SELECT id, eid                                                                                                                                               +
     FROM events                                                                                                                                                  +
     WHERE city_id = v_city_id                                                                                                                                    +
       AND event_start_datetime < v_event_date                                                                                                                    +
       AND event_start_datetime IS NOT NULL                                                                                                                       +
     ORDER BY event_start_datetime DESC                                                                                                                           +
     LIMIT 1                                                                                                                                                      +
   )                                                                                                                                                              +
   SELECT                                                                                                                                                         +
     pe.id,                                                                                                                                                       +
     pe.eid,                                                                                                                                                      +
     get_event_ticket_revenue(pe.id),                                                                                                                             +
     get_event_auction_revenue(pe.id),                                                                                                                            +
     get_event_total_votes(pe.id),                                                                                                                                +
     get_event_ticket_sales(pe.id)                                                                                                                                +
   FROM prev_event pe;                                                                                                                                            +
 END;                                                                                                                                                             +
 $function$                                                                                                                                                       +
 
(1 row)

