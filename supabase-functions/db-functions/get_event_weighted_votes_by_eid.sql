                                                        pg_get_functiondef                                                         
-----------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_event_weighted_votes_by_eid(p_eid character varying, p_round integer DEFAULT NULL::integer)+
  RETURNS TABLE(easel integer, art_id character varying, raw_vote_count bigint, weighted_vote_total numeric)                      +
  LANGUAGE plpgsql                                                                                                                +
  STABLE                                                                                                                          +
 AS $function$                                                                                                                    +
 BEGIN                                                                                                                            +
   RETURN QUERY                                                                                                                   +
   SELECT                                                                                                                         +
     v.easel,                                                                                                                     +
     v.art_id,                                                                                                                    +
     COUNT(*)::BIGINT as raw_vote_count,                                                                                          +
     COALESCE(SUM(v.vote_factor), 0) as weighted_vote_total                                                                       +
   FROM votes v                                                                                                                   +
   WHERE v.eid = p_eid                                                                                                            +
     AND (p_round IS NULL OR v.round = p_round)                                                                                   +
   GROUP BY v.easel, v.art_id                                                                                                     +
   ORDER BY weighted_vote_total DESC;                                                                                             +
 END;                                                                                                                             +
 $function$                                                                                                                       +
 
(1 row)

