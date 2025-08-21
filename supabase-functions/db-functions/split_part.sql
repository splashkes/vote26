                                                                        pg_get_functiondef                                                                         
-------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.split_part(citext, citext, integer)                                                                                            +
  RETURNS text                                                                                                                                                    +
  LANGUAGE sql                                                                                                                                                    +
  IMMUTABLE PARALLEL SAFE STRICT                                                                                                                                  +
 AS $function$                                                                                                                                                    +
     SELECT (pg_catalog.regexp_split_to_array( $1::pg_catalog.text, pg_catalog.regexp_replace($2::pg_catalog.text, '([^a-zA-Z_0-9])', E'\\\\\\1', 'g'), 'i'))[$3];+
 $function$                                                                                                                                                       +
 
(1 row)

