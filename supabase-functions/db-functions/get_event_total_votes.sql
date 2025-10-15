                            pg_get_functiondef                            
--------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_event_total_votes(p_event_id uuid)+
  RETURNS integer                                                        +
  LANGUAGE plpgsql                                                       +
  STABLE SECURITY DEFINER                                                +
 AS $function$                                                           +
 BEGIN                                                                   +
   RETURN (                                                              +
     SELECT COUNT(*)::INTEGER                                            +
     FROM votes                                                          +
     WHERE event_id = p_event_id                                         +
   );                                                                    +
 END;                                                                    +
 $function$                                                              +
 
(1 row)

