                            pg_get_functiondef                            
--------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_weighted_vote_total(p_art_id uuid)+
  RETURNS numeric                                                        +
  LANGUAGE sql                                                           +
  STABLE                                                                 +
 AS $function$                                                           +
   SELECT COALESCE(SUM(vote_factor), 0)                                  +
   FROM votes                                                            +
   WHERE art_id = p_art_id;                                              +
 $function$                                                              +
 
(1 row)

