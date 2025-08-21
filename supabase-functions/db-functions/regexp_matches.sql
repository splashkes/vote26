                                                                   pg_get_functiondef                                                                    
---------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.regexp_matches(citext, citext)                                                                                       +
  RETURNS SETOF text[]                                                                                                                                  +
  LANGUAGE sql                                                                                                                                          +
  IMMUTABLE PARALLEL SAFE STRICT ROWS 1                                                                                                                 +
 AS $function$                                                                                                                                          +
     SELECT pg_catalog.regexp_matches( $1::pg_catalog.text, $2::pg_catalog.text, 'i' );                                                                 +
 $function$                                                                                                                                             +
 
 CREATE OR REPLACE FUNCTION public.regexp_matches(citext, citext, text)                                                                                 +
  RETURNS SETOF text[]                                                                                                                                  +
  LANGUAGE sql                                                                                                                                          +
  IMMUTABLE PARALLEL SAFE STRICT ROWS 10                                                                                                                +
 AS $function$                                                                                                                                          +
     SELECT pg_catalog.regexp_matches( $1::pg_catalog.text, $2::pg_catalog.text, CASE WHEN pg_catalog.strpos($3, 'c') = 0 THEN  $3 || 'i' ELSE $3 END );+
 $function$                                                                                                                                             +
 
(2 rows)

