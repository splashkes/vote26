                                                 pg_get_functiondef                                                 
--------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_event_weighted_votes(p_event_id uuid, p_round integer DEFAULT NULL::integer)+
  RETURNS TABLE(art_id uuid, raw_vote_count bigint, weighted_vote_total numeric)                                   +
  LANGUAGE plpgsql                                                                                                 +
  STABLE                                                                                                           +
  SET search_path TO 'pg_catalog', 'public'                                                                        +
 AS $function$                                                                                                     +
 BEGIN                                                                                                             +
   RETURN QUERY                                                                                                    +
   SELECT                                                                                                          +
     v.art_uuid as art_id,                                                                                         +
     COUNT(*)::BIGINT as raw_vote_count,                                                                           +
     COALESCE(SUM(v.vote_factor), 0) as weighted_vote_total                                                        +
   FROM votes v                                                                                                    +
   WHERE v.event_id = p_event_id                                                                                   +
     AND v.art_uuid IS NOT NULL                                                                                    +
     AND (p_round IS NULL OR v.round = p_round)                                                                    +
   GROUP BY v.art_uuid                                                                                             +
   ORDER BY weighted_vote_total DESC;                                                                              +
 END;                                                                                                              +
 $function$                                                                                                        +
 
(1 row)

