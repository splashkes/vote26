                                                pg_get_functiondef                                                 
-------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.strpos(citext, citext)                                                         +
  RETURNS integer                                                                                                 +
  LANGUAGE sql                                                                                                    +
  IMMUTABLE PARALLEL SAFE STRICT                                                                                  +
 AS $function$                                                                                                    +
     SELECT pg_catalog.strpos( pg_catalog.lower( $1::pg_catalog.text ), pg_catalog.lower( $2::pg_catalog.text ) );+
 $function$                                                                                                       +
 
(1 row)

