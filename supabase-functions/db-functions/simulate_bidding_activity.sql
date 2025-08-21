                                                      pg_get_functiondef                                                       
-------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.simulate_bidding_activity(p_num_bids integer DEFAULT 3, p_start_amount numeric DEFAULT 100)+
  RETURNS jsonb                                                                                                               +
  LANGUAGE plpgsql                                                                                                            +
 AS $function$                                                                                                                +
 DECLARE                                                                                                                      +
   v_event_id UUID;                                                                                                           +
   v_art_id UUID;                                                                                                             +
   v_person_id UUID;                                                                                                          +
   v_bid_amount NUMERIC;                                                                                                      +
   i INT;                                                                                                                     +
   v_bids_created INT := 0;                                                                                                   +
 BEGIN                                                                                                                        +
   -- Get test event and art                                                                                                  +
   SELECT a.id INTO v_art_id                                                                                                  +
   FROM art a                                                                                                                 +
   JOIN events e ON a.event_id = e.id                                                                                         +
   WHERE e.eid = 'TEST123'                                                                                                    +
   ORDER BY a.created_at DESC                                                                                                 +
   LIMIT 1;                                                                                                                   +
                                                                                                                              +
   IF v_art_id IS NULL THEN                                                                                                   +
     -- Create art if needed                                                                                                  +
     PERFORM simulate_voting_activity(1);                                                                                     +
                                                                                                                              +
     SELECT a.id INTO v_art_id                                                                                                +
     FROM art a                                                                                                               +
     JOIN events e ON a.event_id = e.id                                                                                       +
     WHERE e.eid = 'TEST123'                                                                                                  +
     ORDER BY a.created_at DESC                                                                                               +
     LIMIT 1;                                                                                                                 +
   END IF;                                                                                                                    +
                                                                                                                              +
   -- Create test bids                                                                                                        +
   FOR i IN 1..p_num_bids LOOP                                                                                                +
     -- Get or create test person                                                                                             +
     INSERT INTO people (                                                                                                     +
       email,                                                                                                                 +
       phone,                                                                                                                 +
       name,                                                                                                                  +
       hash                                                                                                                   +
     ) VALUES (                                                                                                               +
       'bidder' || i || '@example.com',                                                                                       +
       '+1555001' || LPAD(i::TEXT, 4, '0'),                                                                                   +
       'Test Bidder ' || i,                                                                                                   +
       'test_bidder_hash_' || i                                                                                               +
     )                                                                                                                        +
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name                                                                   +
     RETURNING id INTO v_person_id;                                                                                           +
                                                                                                                              +
     -- Calculate bid amount                                                                                                  +
     v_bid_amount := p_start_amount + (i * 50);                                                                               +
                                                                                                                              +
     -- Create bid                                                                                                            +
     INSERT INTO bids (                                                                                                       +
       art_id,                                                                                                                +
       person_id,                                                                                                             +
       amount                                                                                                                 +
     ) VALUES (                                                                                                               +
       v_art_id,                                                                                                              +
       v_person_id,                                                                                                           +
       v_bid_amount                                                                                                           +
     );                                                                                                                       +
                                                                                                                              +
     v_bids_created := v_bids_created + 1;                                                                                    +
                                                                                                                              +
     -- Small delay to ensure different timestamps                                                                            +
     PERFORM pg_sleep(0.1);                                                                                                   +
   END LOOP;                                                                                                                  +
                                                                                                                              +
   RETURN jsonb_build_object(                                                                                                 +
     'success', true,                                                                                                         +
     'bids_created', v_bids_created,                                                                                          +
     'art_id', v_art_id,                                                                                                      +
     'highest_bid', v_bid_amount                                                                                              +
   );                                                                                                                         +
 END;                                                                                                                         +
 $function$                                                                                                                   +
 
(1 row)

