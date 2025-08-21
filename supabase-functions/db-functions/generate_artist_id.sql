                                   pg_get_functiondef                                    
-----------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.generate_artist_id(first_name text)                  +
  RETURNS text                                                                          +
  LANGUAGE plpgsql                                                                      +
 AS $function$                                                                          +
 DECLARE                                                                                +
     prefix TEXT;                                                                       +
     counter INTEGER := 5000;                                                           +
     new_id TEXT;                                                                       +
     existing_count INTEGER;                                                            +
 BEGIN                                                                                  +
     -- Get first 2 letters of first name, uppercase                                    +
     prefix := UPPER(LEFT(first_name, 2));                                              +
                                                                                        +
     -- Find the next available ID                                                      +
     LOOP                                                                               +
         new_id := prefix || counter::TEXT;                                             +
                                                                                        +
         -- Check if ID exists in any of these fields                                   +
         SELECT COUNT(*) INTO existing_count                                            +
         FROM artist_profiles                                                           +
         WHERE mongo_id = new_id                                                        +
            OR id::TEXT = new_id                                                        +
            OR form_17_entry_id::TEXT = new_id;                                         +
                                                                                        +
         -- If no conflicts, return this ID                                             +
         IF existing_count = 0 THEN                                                     +
             RETURN new_id;                                                             +
         END IF;                                                                        +
                                                                                        +
         -- Increment and try next                                                      +
         counter := counter + 1;                                                        +
                                                                                        +
         -- Safety check to prevent infinite loop                                       +
         IF counter > 9999 THEN                                                         +
             RAISE EXCEPTION 'Could not generate unique artist ID for prefix %', prefix;+
         END IF;                                                                        +
     END LOOP;                                                                          +
 END;                                                                                   +
 $function$                                                                             +
 
(1 row)

