                                                                         pg_get_functiondef                                                                          
---------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.translate(citext, citext, text)                                                                                                  +
  RETURNS text                                                                                                                                                      +
  LANGUAGE sql                                                                                                                                                      +
  IMMUTABLE PARALLEL SAFE STRICT                                                                                                                                    +
 AS $function$                                                                                                                                                      +
     SELECT pg_catalog.translate( pg_catalog.translate( $1::pg_catalog.text, pg_catalog.lower($2::pg_catalog.text), $3), pg_catalog.upper($2::pg_catalog.text), $3);+
 $function$                                                                                                                                                         +
 
(1 row)

