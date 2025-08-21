                                                                     pg_get_functiondef                                                                     
------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.regexp_replace(citext, citext, text)                                                                                    +
  RETURNS text                                                                                                                                             +
  LANGUAGE sql                                                                                                                                             +
  IMMUTABLE PARALLEL SAFE STRICT                                                                                                                           +
 AS $function$                                                                                                                                             +
     SELECT pg_catalog.regexp_replace( $1::pg_catalog.text, $2::pg_catalog.text, $3, 'i');                                                                 +
 $function$                                                                                                                                                +
 
 CREATE OR REPLACE FUNCTION public.regexp_replace(citext, citext, text, text)                                                                              +
  RETURNS text                                                                                                                                             +
  LANGUAGE sql                                                                                                                                             +
  IMMUTABLE PARALLEL SAFE STRICT                                                                                                                           +
 AS $function$                                                                                                                                             +
     SELECT pg_catalog.regexp_replace( $1::pg_catalog.text, $2::pg_catalog.text, $3, CASE WHEN pg_catalog.strpos($4, 'c') = 0 THEN  $4 || 'i' ELSE $4 END);+
 $function$                                                                                                                                                +
 
(2 rows)

