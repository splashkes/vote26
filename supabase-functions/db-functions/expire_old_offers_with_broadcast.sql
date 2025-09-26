                                  pg_get_functiondef                                  
--------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.expire_old_offers_with_broadcast()                +
  RETURNS integer                                                                    +
  LANGUAGE plpgsql                                                                   +
  SECURITY DEFINER                                                                   +
 AS $function$                                                                       +
 DECLARE                                                                             +
     expired_record RECORD;                                                          +
     expired_count INTEGER := 0;                                                     +
 BEGIN                                                                               +
     -- Update and capture expired offers                                            +
     FOR expired_record IN                                                           +
         UPDATE artwork_offers                                                       +
         SET status = 'expired', updated_at = NOW()                                  +
         WHERE status = 'pending'                                                    +
             AND expires_at <= NOW()                                                 +
         RETURNING id, art_id, offered_to_person_id, offered_amount                  +
     LOOP                                                                            +
         expired_count := expired_count + 1;                                         +
                                                                                     +
         -- Send broadcast for each expired offer                                    +
         BEGIN                                                                       +
             PERFORM realtime.send(                                                  +
                 jsonb_build_object(                                                 +
                     'channel', 'offer_expiration',                                  +
                     'event', 'offer_expired',                                       +
                     'payload', jsonb_build_object(                                  +
                         'offer_id', expired_record.id,                              +
                         'art_id', expired_record.art_id,                            +
                         'offered_to_person_id', expired_record.offered_to_person_id,+
                         'offered_amount', expired_record.offered_amount,            +
                         'expired_at', NOW()                                         +
                     )                                                               +
                 )                                                                   +
             );                                                                      +
         EXCEPTION                                                                   +
             WHEN OTHERS THEN                                                        +
                 -- Continue if broadcast fails                                      +
                 NULL;                                                               +
         END;                                                                        +
     END LOOP;                                                                       +
                                                                                     +
     RETURN expired_count;                                                           +
 END;                                                                                +
 $function$                                                                          +
 
(1 row)

