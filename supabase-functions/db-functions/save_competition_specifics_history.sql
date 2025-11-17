                           pg_get_functiondef                           
------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.save_competition_specifics_history()+
  RETURNS trigger                                                      +
  LANGUAGE plpgsql                                                     +
 AS $function$                                                         +
 BEGIN                                                                 +
   -- Only save history if content, name, or visibility changed        +
   IF OLD.content IS DISTINCT FROM NEW.content                         +
      OR OLD.name IS DISTINCT FROM NEW.name                            +
      OR OLD.visibility IS DISTINCT FROM NEW.visibility THEN           +
                                                                       +
     -- Insert old version into history                                +
     INSERT INTO competition_specifics_history (                       +
       competition_specific_id,                                        +
       name,                                                           +
       content,                                                        +
       visibility,                                                     +
       version,                                                        +
       created_at,                                                     +
       created_by                                                      +
     ) VALUES (                                                        +
       OLD.id,                                                         +
       OLD.name,                                                       +
       OLD.content,                                                    +
       OLD.visibility,                                                 +
       OLD.version,                                                    +
       OLD.updated_at,                                                 +
       OLD.created_by                                                  +
     );                                                                +
                                                                       +
     -- Increment version                                              +
     NEW.version = OLD.version + 1;                                    +
   END IF;                                                             +
                                                                       +
   RETURN NEW;                                                         +
 END;                                                                  +
 $function$                                                            +
 
(1 row)

