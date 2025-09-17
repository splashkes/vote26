                                          pg_get_functiondef                                          
------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.merge_duplicate_people()                                          +
  RETURNS void                                                                                       +
  LANGUAGE plpgsql                                                                                   +
 AS $function$                                                                                       +
  DECLARE                                                                                            +
      dup_record RECORD;                                                                             +
      master_id UUID;                                                                                +
  BEGIN                                                                                              +
      -- Find duplicates by email                                                                    +
      FOR dup_record IN                                                                              +
          SELECT email, array_agg(id ORDER BY created_at) as ids                                     +
          FROM people                                                                                +
          WHERE email IS NOT NULL                                                                    +
          GROUP BY email                                                                             +
          HAVING count(*) > 1                                                                        +
      LOOP                                                                                           +
          master_id := dup_record.ids[1];                                                            +
          -- Update all references to point to master record                                         +
          UPDATE votes SET person_id = master_id WHERE person_id = ANY(dup_record.ids[2:]);          +
          UPDATE bids SET person_id = master_id WHERE person_id = ANY(dup_record.ids[2:]);           +
          UPDATE vote_weights SET person_id = master_id WHERE person_id = ANY(dup_record.ids[2:]);   +
          UPDATE artist_profiles SET person_id = master_id WHERE person_id = ANY(dup_record.ids[2:]);+
          -- Delete duplicates                                                                       +
          DELETE FROM people WHERE id = ANY(dup_record.ids[2:]);                                     +
      END LOOP;                                                                                      +
                                                                                                     +
      -- Repeat for phone numbers                                                                    +
      FOR dup_record IN                                                                              +
          SELECT phone, array_agg(id ORDER BY created_at) as ids                                     +
          FROM people                                                                                +
          WHERE phone IS NOT NULL                                                                    +
          GROUP BY phone                                                                             +
          HAVING count(*) > 1                                                                        +
      LOOP                                                                                           +
          master_id := dup_record.ids[1];                                                            +
          UPDATE votes SET person_id = master_id WHERE person_id = ANY(dup_record.ids[2:]);          +
          UPDATE bids SET person_id = master_id WHERE person_id = ANY(dup_record.ids[2:]);           +
          UPDATE vote_weights SET person_id = master_id WHERE person_id = ANY(dup_record.ids[2:]);   +
          UPDATE artist_profiles SET person_id = master_id WHERE person_id = ANY(dup_record.ids[2:]);+
          DELETE FROM people WHERE id = ANY(dup_record.ids[2:]);                                     +
      END LOOP;                                                                                      +
  END;                                                                                               +
  $function$                                                                                         +
 
(1 row)

