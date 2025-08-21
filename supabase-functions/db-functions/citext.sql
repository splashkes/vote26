                 pg_get_functiondef                  
-----------------------------------------------------
 CREATE OR REPLACE FUNCTION public.citext(boolean)  +
  RETURNS citext                                    +
  LANGUAGE internal                                 +
  IMMUTABLE PARALLEL SAFE STRICT                    +
 AS $function$booltext$function$                    +
 
 CREATE OR REPLACE FUNCTION public.citext(inet)     +
  RETURNS citext                                    +
  LANGUAGE internal                                 +
  IMMUTABLE PARALLEL SAFE STRICT                    +
 AS $function$network_show$function$                +
 
 CREATE OR REPLACE FUNCTION public.citext(character)+
  RETURNS citext                                    +
  LANGUAGE internal                                 +
  IMMUTABLE PARALLEL SAFE STRICT                    +
 AS $function$rtrim1$function$                      +
 
(3 rows)

