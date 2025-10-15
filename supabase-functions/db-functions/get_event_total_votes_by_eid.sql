                             pg_get_functiondef                             
----------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_event_total_votes_by_eid(p_eid text)+
  RETURNS integer                                                          +
  LANGUAGE plpgsql                                                         +
  STABLE SECURITY DEFINER                                                  +
 AS $function$                                                             +
 BEGIN                                                                     +
   RETURN (                                                                +
     SELECT COUNT(*)::INTEGER                                              +
     FROM votes                                                            +
     WHERE eid = p_eid                                                     +
   );                                                                      +
 END;                                                                      +
 $function$                                                                +
 
(1 row)

