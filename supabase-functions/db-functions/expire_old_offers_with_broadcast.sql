                                         pg_get_functiondef                                          
-----------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.expire_old_offers_with_broadcast()                               +
  RETURNS integer                                                                                   +
  LANGUAGE plpgsql                                                                                  +
  SECURITY DEFINER                                                                                  +
 AS $function$                                                                                      +
 DECLARE                                                                                            +
     expired_record RECORD;                                                                         +
     expired_count INTEGER := 0;                                                                    +
 BEGIN                                                                                              +
     -- Update and capture expired offers                                                           +
     FOR expired_record IN                                                                          +
         UPDATE artwork_offers                                                                      +
         SET status = 'expired', updated_at = NOW()                                                 +
         WHERE status = 'pending'                                                                   +
             AND expires_at <= NOW()                                                                +
         RETURNING id, art_id, offered_to_person_id, offered_amount                                 +
     LOOP                                                                                           +
         expired_count := expired_count + 1;                                                        +
                                                                                                    +
         -- Send broadcast for each expired offer                                                   +
         BEGIN                                                                                      +
             PERFORM realtime.send(                                                                 +
                 jsonb_build_object(                                                                +
                     'channel', 'offer_expiration',                                                 +
                     'event', 'offer_expired',                                                      +
                     'payload', jsonb_build_object(                                                 +
                         'offer_id', expired_record.id,                                             +
                         'art_id', expired_record.art_id,                                           +
                         'offered_to_person_id', expired_record.offered_to_person_id,               +
                         'offered_amount', expired_record.offered_amount,                           +
                         'expired_at', NOW()                                                        +
                     )                                                                              +
                 )                                                                                  +
             );                                                                                     +
         EXCEPTION                                                                                  +
             WHEN OTHERS THEN                                                                       +
                 -- Continue if broadcast fails                                                     +
                 NULL;                                                                              +
         END;                                                                                       +
     END LOOP;                                                                                      +
                                                                                                    +
     RETURN expired_count;                                                                          +
 END;                                                                                               +
 $function$                                                                                         +
 
 CREATE OR REPLACE FUNCTION public.expire_old_offers_with_broadcast(expiry_hours integer DEFAULT 48)+
  RETURNS integer                                                                                   +
  LANGUAGE plpgsql                                                                                  +
  SECURITY DEFINER                                                                                  +
 AS $function$                                                                                      +
 DECLARE                                                                                            +
     expired_record RECORD;                                                                         +
     expired_count INTEGER := 0;                                                                    +
 BEGIN                                                                                              +
     -- Loop through all expired offers and update them                                             +
     FOR expired_record IN                                                                          +
         SELECT * FROM artwork_offers                                                               +
         WHERE status = 'pending'                                                                   +
         AND created_at < NOW() - INTERVAL '1 hour' * expiry_hours                                  +
     LOOP                                                                                           +
         -- Update the offer to expired status                                                      +
         UPDATE artwork_offers                                                                      +
         SET status = 'expired', expired_at = NOW()                                                 +
         WHERE id = expired_record.id;                                                              +
                                                                                                    +
         expired_count := expired_count + 1;                                                        +
                                                                                                    +
         -- Send broadcast for each expired offer                                                   +
         BEGIN                                                                                      +
             PERFORM realtime.send(                                                                 +
                 jsonb_build_object(                                  -- payload (JSONB)            +
                     'offer_id', expired_record.id,                                                 +
                     'art_id', expired_record.art_id,                                               +
                     'offered_to_person_id', expired_record.offered_to_person_id,                   +
                     'offered_amount', expired_record.offered_amount,                               +
                     'expired_at', NOW()                                                            +
                 ),                                                                                 +
                 'offer_expired',                     -- event name                                 +
                 'offer_expiration',                  -- topic/channel name                         +
                 false                               -- public flag                                 +
             );                                                                                     +
         EXCEPTION                                                                                  +
             WHEN OTHERS THEN                                                                       +
                 -- Continue if broadcast fails                                                     +
                 NULL;                                                                              +
         END;                                                                                       +
     END LOOP;                                                                                      +
                                                                                                    +
     RETURN expired_count;                                                                          +
 END;                                                                                               +
 $function$                                                                                         +
 
(2 rows)

