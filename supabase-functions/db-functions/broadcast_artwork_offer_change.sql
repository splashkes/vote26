                                      pg_get_functiondef                                       
-----------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.broadcast_artwork_offer_change()                           +
  RETURNS trigger                                                                             +
  LANGUAGE plpgsql                                                                            +
 AS $function$                                                                                +
 DECLARE                                                                                      +
     payload JSON;                                                                            +
     art_code TEXT;                                                                           +
     event_eid TEXT;                                                                          +
 BEGIN                                                                                        +
     -- Get art code and event info for broadcast                                             +
     SELECT a.art_code, e.eid INTO art_code, event_eid                                        +
     FROM art a                                                                               +
     JOIN events e ON a.event_id = e.id                                                       +
     WHERE a.id = COALESCE(NEW.art_id, OLD.art_id);                                           +
                                                                                              +
     payload = json_build_object(                                                             +
         'table', 'artwork_offers',                                                           +
         'type', TG_OP,                                                                       +
         'id', COALESCE(NEW.id, OLD.id),                                                      +
         'art_id', COALESCE(NEW.art_id, OLD.art_id),                                          +
         'art_code', art_code,                                                                +
         'event_eid', event_eid,                                                              +
         'offered_to_person_id', COALESCE(NEW.offered_to_person_id, OLD.offered_to_person_id),+
         'status', COALESCE(NEW.status, OLD.status),                                          +
         'offered_amount', COALESCE(NEW.offered_amount, OLD.offered_amount)                   +
     );                                                                                       +
                                                                                              +
     PERFORM pg_notify('artwork_offer_changed', payload::text);                               +
     RETURN COALESCE(NEW, OLD);                                                               +
 END;                                                                                         +
 $function$                                                                                   +
 
(1 row)

