                       pg_get_functiondef                       
----------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.refresh_vote_weights()      +
  RETURNS void                                                 +
  LANGUAGE plpgsql                                             +
 AS $function$                                                 +
  BEGIN                                                        +
    REFRESH MATERIALIZED VIEW CONCURRENTLY person_vote_weights;+
  END;                                                         +
  $function$                                                   +
 
(1 row)

