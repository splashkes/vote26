                                                                       pg_get_functiondef                                                                       
----------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.sync_advances_to_fields()                                                                                                   +
  RETURNS trigger                                                                                                                                              +
  LANGUAGE plpgsql                                                                                                                                             +
 AS $function$                                                                                                                                                 +
 BEGIN                                                                                                                                                         +
   -- If EID is set, update ID from it                                                                                                                         +
   IF NEW.advances_to_event_eid IS NOT NULL AND (NEW.advances_to_event_id IS NULL OR OLD.advances_to_event_eid IS DISTINCT FROM NEW.advances_to_event_eid) THEN+
     SELECT id INTO NEW.advances_to_event_id                                                                                                                   +
     FROM events                                                                                                                                               +
     WHERE eid = NEW.advances_to_event_eid;                                                                                                                    +
   END IF;                                                                                                                                                     +
                                                                                                                                                               +
   -- If ID is set, update EID from it                                                                                                                         +
   IF NEW.advances_to_event_id IS NOT NULL AND (NEW.advances_to_event_eid IS NULL OR OLD.advances_to_event_id IS DISTINCT FROM NEW.advances_to_event_id) THEN  +
     SELECT eid INTO NEW.advances_to_event_eid                                                                                                                 +
     FROM events                                                                                                                                               +
     WHERE id = NEW.advances_to_event_id;                                                                                                                      +
   END IF;                                                                                                                                                     +
                                                                                                                                                               +
   RETURN NEW;                                                                                                                                                 +
 END;                                                                                                                                                          +
 $function$                                                                                                                                                    +
 
(1 row)

