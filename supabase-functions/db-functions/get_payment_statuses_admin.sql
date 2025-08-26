                               pg_get_functiondef                               
--------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_payment_statuses_admin(p_event_id uuid) +
  RETURNS TABLE(id uuid, code character varying, description character varying)+
  LANGUAGE plpgsql                                                             +
  SECURITY DEFINER                                                             +
 AS $function$                                                                 +
 BEGIN                                                                         +
   -- Return all payment statuses used by artworks in this event               +
   RETURN QUERY                                                                +
   SELECT DISTINCT                                                             +
     ps.id,                                                                    +
     ps.code,                                                                  +
     ps.description                                                            +
   FROM payment_statuses ps                                                    +
   JOIN art a ON a.buyer_pay_recent_status_id = ps.id                          +
   WHERE a.event_id = p_event_id;                                              +
 END;                                                                          +
 $function$                                                                    +
 
(1 row)

