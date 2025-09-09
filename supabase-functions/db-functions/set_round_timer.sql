                                             pg_get_functiondef                                              
-------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.set_round_timer(p_round_id uuid, p_closing_time timestamp with time zone)+
  RETURNS void                                                                                              +
  LANGUAGE plpgsql                                                                                          +
  SECURITY DEFINER                                                                                          +
 AS $function$                                                                                              +
 BEGIN                                                                                                      +
   -- Update the round's closing_time                                                                       +
   UPDATE rounds                                                                                            +
   SET                                                                                                      +
     closing_time = p_closing_time,                                                                         +
     updated_at = NOW()                                                                                     +
   WHERE id = p_round_id;                                                                                   +
                                                                                                            +
   -- Verify the update was successful                                                                      +
   IF NOT FOUND THEN                                                                                        +
     RAISE EXCEPTION 'Round with ID % not found', p_round_id;                                               +
   END IF;                                                                                                  +
 END;                                                                                                       +
 $function$                                                                                                 +
 
(1 row)

