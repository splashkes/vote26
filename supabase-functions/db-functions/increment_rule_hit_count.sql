                             pg_get_functiondef                             
----------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.increment_rule_hit_count(p_rule_id text)+
  RETURNS void                                                             +
  LANGUAGE plpgsql                                                         +
 AS $function$                                                             +
 BEGIN                                                                     +
   UPDATE event_linter_rules                                               +
   SET hit_count = hit_count + 1                                           +
   WHERE rule_id = p_rule_id;                                              +
 END;                                                                      +
 $function$                                                                +
 
(1 row)

