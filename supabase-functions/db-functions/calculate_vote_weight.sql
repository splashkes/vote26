                                                           pg_get_functiondef                                                           
----------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.calculate_vote_weight(p_person_id uuid)                                                             +
  RETURNS TABLE(base_weight numeric, artist_bonus numeric, vote_history_bonus numeric, bid_history_bonus numeric, total_weight numeric)+
  LANGUAGE plpgsql                                                                                                                     +
  STABLE                                                                                                                               +
 AS $function$                                                                                                                         +
 DECLARE                                                                                                                               +
   v_is_artist BOOLEAN;                                                                                                                +
   v_past_votes_count INT;                                                                                                             +
   v_total_bid_amount NUMERIC(10,2);                                                                                                   +
   v_base NUMERIC(4,2) := 1.0;                                                                                                         +
   v_artist_bonus NUMERIC(4,2) := 0.0;                                                                                                 +
   v_vote_bonus NUMERIC(4,2) := 0.0;                                                                                                   +
   v_bid_bonus NUMERIC(4,2) := 0.0;                                                                                                    +
 BEGIN                                                                                                                                 +
   -- Get artist status                                                                                                                +
   SELECT is_artist INTO v_is_artist                                                                                                   +
   FROM people                                                                                                                         +
   WHERE id = p_person_id;                                                                                                             +
                                                                                                                                       +
   -- Calculate artist bonus (2x means +1.0)                                                                                           +
   IF v_is_artist = true THEN                                                                                                          +
     v_artist_bonus := 1.0;                                                                                                            +
   END IF;                                                                                                                             +
                                                                                                                                       +
   -- Calculate vote history bonus (+0.1 per vote, max +3.0)                                                                           +
   SELECT COUNT(*) INTO v_past_votes_count                                                                                             +
   FROM votes                                                                                                                          +
   WHERE person_id = p_person_id;                                                                                                      +
                                                                                                                                       +
   v_vote_bonus := LEAST(v_past_votes_count * 0.1, 3.0);                                                                               +
                                                                                                                                       +
   -- Calculate bid history bonus (+0.001 per dollar, max +2.0)                                                                        +
   SELECT COALESCE(SUM(amount), 0) INTO v_total_bid_amount                                                                             +
   FROM bids                                                                                                                           +
   WHERE person_id = p_person_id;                                                                                                      +
                                                                                                                                       +
   v_bid_bonus := LEAST(v_total_bid_amount * 0.001, 2.0);                                                                              +
                                                                                                                                       +
   -- Return the calculated weights                                                                                                    +
   RETURN QUERY SELECT                                                                                                                 +
     v_base,                                                                                                                           +
     v_artist_bonus,                                                                                                                   +
     v_vote_bonus::NUMERIC(4,2),                                                                                                       +
     v_bid_bonus::NUMERIC(4,2),                                                                                                        +
     (v_base + v_artist_bonus + v_vote_bonus + v_bid_bonus)::NUMERIC(4,2);                                                             +
 END;                                                                                                                                  +
 $function$                                                                                                                            +
 
(1 row)

