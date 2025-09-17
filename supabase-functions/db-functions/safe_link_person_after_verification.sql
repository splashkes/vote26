                                         pg_get_functiondef                                         
----------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.safe_link_person_after_verification()                           +
  RETURNS trigger                                                                                  +
  LANGUAGE plpgsql                                                                                 +
 AS $function$                                                                                     +
  DECLARE                                                                                          +
    v_person_id UUID;                                                                              +
    v_person_name TEXT;                                                                            +
    v_normalized_phone TEXT;                                                                       +
  BEGIN                                                                                            +
    -- Only process when phone_confirmed_at changes from NULL to a timestamp                       +
    IF OLD.phone_confirmed_at IS NOT NULL OR NEW.phone_confirmed_at IS NULL THEN                   +
      RETURN NEW;                                                                                  +
    END IF;                                                                                        +
                                                                                                   +
    -- Skip if already linked                                                                      +
    SELECT id INTO v_person_id FROM people WHERE auth_user_id = NEW.id LIMIT 1;                    +
    IF v_person_id IS NOT NULL THEN                                                                +
      RETURN NEW;                                                                                  +
    END IF;                                                                                        +
                                                                                                   +
    -- Normalize phone for matching                                                                +
    v_normalized_phone := NEW.phone;                                                               +
    IF v_normalized_phone LIKE '+1%' THEN                                                          +
      v_normalized_phone := SUBSTRING(v_normalized_phone FROM 3);                                  +
    ELSIF v_normalized_phone LIKE '+%' THEN                                                        +
      v_normalized_phone := SUBSTRING(v_normalized_phone FROM 2);                                  +
    END IF;                                                                                        +
                                                                                                   +
    -- Try to find existing person with matching phone                                             +
    SELECT id, name INTO v_person_id, v_person_name                                                +
    FROM people                                                                                    +
    WHERE auth_user_id IS NULL                                                                     +
      AND (                                                                                        +
        phone = '+1' || v_normalized_phone                                                         +
        OR phone = '+' || v_normalized_phone                                                       +
        OR phone = v_normalized_phone                                                              +
        OR phone = NEW.phone                                                                       +
        OR REPLACE(REPLACE(phone, '+1', ''), '+', '') = v_normalized_phone                         +
      )                                                                                            +
    ORDER BY created_at DESC                                                                       +
    LIMIT 1;                                                                                       +
                                                                                                   +
    IF v_person_id IS NOT NULL THEN                                                                +
      -- Link existing person                                                                      +
      UPDATE people                                                                                +
      SET                                                                                          +
        auth_user_id = NEW.id,                                                                     +
        updated_at = NOW()                                                                         +
      WHERE id = v_person_id;                                                                      +
    ELSE                                                                                           +
      -- Create new person                                                                         +
      v_person_id := gen_random_uuid();                                                            +
      v_person_name := 'User';                                                                     +
                                                                                                   +
      INSERT INTO people (                                                                         +
        id, phone, name, nickname, auth_user_id, created_at, updated_at                            +
      ) VALUES (                                                                                   +
        v_person_id, '+1' || v_normalized_phone, v_person_name, v_person_name, NEW.id, NOW(), NOW()+
      );                                                                                           +
    END IF;                                                                                        +
                                                                                                   +
    RETURN NEW;                                                                                    +
  END;                                                                                             +
  $function$                                                                                       +
 
(1 row)

