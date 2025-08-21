                        pg_get_functiondef                        
------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.citext_smaller(citext, citext)+
  RETURNS citext                                                 +
  LANGUAGE c                                                     +
  IMMUTABLE PARALLEL SAFE STRICT                                 +
 AS '$libdir/citext', $function$citext_smaller$function$         +
 
(1 row)

