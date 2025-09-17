                                               pg_get_functiondef                                                
-----------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.sync_round_contestants_to_art()                                              +
  RETURNS trigger                                                                                               +
  LANGUAGE plpgsql                                                                                              +
 AS $function$                                                                                                  +
  DECLARE                                                                                                       +
      v_event_id UUID;                                                                                          +
      v_event_eid TEXT;                                                                                         +
      v_round_number INTEGER;                                                                                   +
      v_art_code TEXT;                                                                                          +
      v_existing_art_id UUID;                                                                                   +
  BEGIN                                                                                                         +
      -- Get event_id and round_number from the rounds table                                                    +
      SELECT r.event_id, r.round_number, e.eid                                                                  +
      INTO v_event_id, v_round_number, v_event_eid                                                              +
      FROM rounds r                                                                                             +
      JOIN events e ON e.id = r.event_id                                                                        +
      WHERE r.id = COALESCE(NEW.round_id, OLD.round_id);                                                        +
                                                                                                                +
      -- Generate art_code                                                                                      +
      v_art_code := v_event_eid || '-' || v_round_number || '-' || COALESCE(NEW.easel_number, OLD.easel_number);+
                                                                                                                +
      -- Handle INSERT and UPDATE                                                                               +
      IF TG_OP IN ('INSERT', 'UPDATE') THEN                                                                     +
          -- Only process if we have a valid easel assignment (not null or 0)                                   +
          IF NEW.easel_number IS NOT NULL AND NEW.easel_number > 0 AND NEW.artist_id IS NOT NULL THEN           +
              -- Check if art record already exists                                                             +
              SELECT id INTO v_existing_art_id                                                                  +
              FROM art                                                                                          +
              WHERE art_code = v_art_code;                                                                      +
                                                                                                                +
              IF v_existing_art_id IS NOT NULL THEN                                                             +
                  -- Update existing art record with new artist                                                 +
                  UPDATE art                                                                                    +
                  SET artist_id = NEW.artist_id,                                                                +
                      updated_at = NOW()                                                                        +
                  WHERE id = v_existing_art_id;                                                                 +
              ELSE                                                                                              +
                  -- Create new art record                                                                      +
                  INSERT INTO art (                                                                             +
                      art_code,                                                                                 +
                      artist_id,                                                                                +
                      event_id,                                                                                 +
                      round,                                                                                    +
                      easel,                                                                                    +
                      status,                                                                                   +
                      starting_bid,                                                                             +
                      current_bid,                                                                              +
                      vote_count,                                                                               +
                      bid_count                                                                                 +
                  ) VALUES (                                                                                    +
                      v_art_code,                                                                               +
                      NEW.artist_id,                                                                            +
                      v_event_id,                                                                               +
                      v_round_number,                                                                           +
                      NEW.easel_number,                                                                         +
                      'active'::art_status,                                                                     +
                      50, -- Default starting bid                                                               +
                      50, -- Current bid starts at starting bid                                                 +
                      0,  -- Vote count starts at 0                                                             +
                      0   -- Bid count starts at 0                                                              +
                  );                                                                                            +
              END IF;                                                                                           +
          END IF;                                                                                               +
      END IF;                                                                                                   +
                                                                                                                +
      -- Handle DELETE or UPDATE that removes artist (sets artist_id to NULL)                                   +
      IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.artist_id IS NULL AND OLD.artist_id IS NOT NULL) THEN    +
          -- Find the art record                                                                                +
          SELECT id INTO v_existing_art_id                                                                      +
          FROM art                                                                                              +
          WHERE art_code = v_art_code;                                                                          +
                                                                                                                +
          IF v_existing_art_id IS NOT NULL THEN                                                                 +
              -- Set artist_id to NULL but preserve the art record and its data                                 +
              UPDATE art                                                                                        +
              SET artist_id = NULL,                                                                             +
                  updated_at = NOW()                                                                            +
              WHERE id = v_existing_art_id;                                                                     +
          END IF;                                                                                               +
      END IF;                                                                                                   +
                                                                                                                +
      RETURN NEW;                                                                                               +
  END;                                                                                                          +
  $function$                                                                                                    +
 
(1 row)

