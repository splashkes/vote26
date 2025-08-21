                       pg_get_functiondef                        
-----------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.citext_larger(citext, citext)+
  RETURNS citext                                                +
  LANGUAGE c                                                    +
  IMMUTABLE PARALLEL SAFE STRICT                                +
 AS '$libdir/citext', $function$citext_larger$function$         +
 
(1 row)

