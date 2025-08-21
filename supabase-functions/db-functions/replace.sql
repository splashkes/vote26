                                                                             pg_get_functiondef                                                                              
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.replace(citext, citext, citext)                                                                                                          +
  RETURNS text                                                                                                                                                              +
  LANGUAGE sql                                                                                                                                                              +
  IMMUTABLE PARALLEL SAFE STRICT                                                                                                                                            +
 AS $function$                                                                                                                                                              +
     SELECT pg_catalog.regexp_replace( $1::pg_catalog.text, pg_catalog.regexp_replace($2::pg_catalog.text, '([^a-zA-Z_0-9])', E'\\\\\\1', 'g'), $3::pg_catalog.text, 'gi' );+
 $function$                                                                                                                                                                 +
 
(1 row)

