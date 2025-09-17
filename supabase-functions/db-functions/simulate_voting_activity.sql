                                    pg_get_functiondef                                     
-------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.simulate_voting_activity(p_num_votes integer DEFAULT 5)+
  RETURNS jsonb                                                                           +
  LANGUAGE plpgsql                                                                        +
 AS $function$                                                                            +
  DECLARE                                                                                 +
    v_event_id UUID;                                                                      +
    v_artist_id UUID;                                                                     +
    v_art_id UUID;                                                                        +
    v_person_id UUID;                                                                     +
    v_round INT := 1;                                                                     +
    i INT;                                                                                +
    v_votes_created INT := 0;                                                             +
  BEGIN                                                                                   +
    -- Get test event                                                                     +
    SELECT id INTO v_event_id FROM events WHERE eid = 'TEST123';                          +
                                                                                          +
    IF v_event_id IS NULL THEN                                                            +
      RETURN jsonb_build_object('error', 'Test event not found');                         +
    END IF;                                                                               +
                                                                                          +
    -- Create a test artist if needed                                                     +
    INSERT INTO artist_profiles (name, entry_id)                                          +
    VALUES ('Test Artist ' || NOW()::TEXT, 99999)                                         +
    ON CONFLICT (entry_id) DO UPDATE SET name = EXCLUDED.name                             +
    RETURNING id INTO v_artist_id;                                                        +
                                                                                          +
    -- Create test art piece                                                              +
    INSERT INTO art (                                                                     +
      event_id,                                                                           +
      artist_id,                                                                          +
      art_code,                                                                           +
      round,                                                                              +
      easel,                                                                              +
      status                                                                              +
    ) VALUES (                                                                            +
      v_event_id,                                                                         +
      v_artist_id,                                                                        +
      'TEST123-' || v_round || '-1',                                                      +
      v_round,                                                                            +
      1,                                                                                  +
      'active'                                                                            +
    )                                                                                     +
    ON CONFLICT (art_code) DO UPDATE SET artist_id = v_artist_id                          +
    RETURNING id INTO v_art_id;                                                           +
                                                                                          +
    -- Create test votes                                                                  +
    FOR i IN 1..p_num_votes LOOP                                                          +
      -- Create a test person                                                             +
      INSERT INTO people (                                                                +
        email,                                                                            +
        phone,                                                                            +
        name,                                                                             +
        hash                                                                              +
      ) VALUES (                                                                          +
        'test' || i || '@example.com',                                                    +
        '+1555000' || LPAD(i::TEXT, 4, '0'),                                              +
        'Test Voter ' || i,                                                               +
        'test_hash_' || i                                                                 +
      )                                                                                   +
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name                              +
      RETURNING id INTO v_person_id;                                                      +
                                                                                          +
      -- Create vote                                                                      +
      BEGIN                                                                               +
        INSERT INTO votes (                                                               +
          event_id,                                                                       +
          round,                                                                          +
          art_id,                                                                         +
          person_id,                                                                      +
          auth_method                                                                     +
        ) VALUES (                                                                        +
          v_event_id,                                                                     +
          v_round,                                                                        +
          v_art_id,                                                                       +
          v_person_id,                                                                    +
          'qr'                                                                            +
        );                                                                                +
                                                                                          +
        v_votes_created := v_votes_created + 1;                                           +
      EXCEPTION WHEN unique_violation THEN                                                +
        -- Vote already exists, skip                                                      +
        NULL;                                                                             +
      END;                                                                                +
    END LOOP;                                                                             +
                                                                                          +
    RETURN jsonb_build_object(                                                            +
      'success', true,                                                                    +
      'votes_created', v_votes_created,                                                   +
      'art_id', v_art_id,                                                                 +
      'artist_id', v_artist_id                                                            +
    );                                                                                    +
  END;                                                                                    +
  $function$                                                                              +
 
(1 row)

