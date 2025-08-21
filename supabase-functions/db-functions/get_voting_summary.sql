                          pg_get_functiondef                           
-----------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_voting_summary(p_event_id uuid)+
  RETURNS jsonb                                                       +
  LANGUAGE plpgsql                                                    +
 AS $function$                                                        +
 DECLARE                                                              +
   v_summary JSONB;                                                   +
   v_total_votes INT;                                                 +
   v_unique_voters INT;                                               +
   v_current_round INT;                                               +
 BEGIN                                                                +
   -- Get current round                                               +
   SELECT current_round INTO v_current_round                          +
   FROM events                                                        +
   WHERE id = p_event_id;                                             +
                                                                      +
   -- Get voting stats                                                +
   SELECT                                                             +
     COUNT(*) as total_votes,                                         +
     COUNT(DISTINCT person_id) as unique_voters                       +
   INTO v_total_votes, v_unique_voters                                +
   FROM votes v                                                       +
   JOIN art a ON v.art_id = a.id                                      +
   WHERE a.event_id = p_event_id                                      +
     AND v.round = v_current_round;                                   +
                                                                      +
   -- Build summary                                                   +
   v_summary := jsonb_build_object(                                   +
     'event_id', p_event_id,                                          +
     'current_round', v_current_round,                                +
     'total_votes', v_total_votes,                                    +
     'unique_voters', v_unique_voters,                                +
     'leaders', get_voting_leaders(p_event_id),                       +
     'timestamp', NOW()                                               +
   );                                                                 +
                                                                      +
   RETURN v_summary;                                                  +
 END;                                                                 +
 $function$                                                           +
 
(1 row)

