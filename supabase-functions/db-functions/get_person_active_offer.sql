                                           pg_get_functiondef                                            
---------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_person_active_offer(p_art_id uuid, p_person_id uuid)             +
  RETURNS TABLE(offer_id uuid, offered_amount numeric, expires_at timestamp with time zone, bid_id uuid)+
  LANGUAGE plpgsql                                                                                      +
  SECURITY DEFINER                                                                                      +
 AS $function$                                                                                          +
 BEGIN                                                                                                  +
   RETURN QUERY                                                                                         +
   SELECT                                                                                               +
     ao.id as offer_id,                                                                                 +
     ao.offered_amount,                                                                                 +
     ao.expires_at,                                                                                     +
     ao.bid_id                                                                                          +
   FROM artwork_offers ao                                                                               +
   WHERE ao.art_id = p_art_id                                                                           +
     AND ao.offered_to_person_id = p_person_id                                                          +
     AND ao.status = 'pending'                                                                          +
     AND ao.expires_at > NOW()                                                                          +
   LIMIT 1;                                                                                             +
 END;                                                                                                   +
 $function$                                                                                             +
 
(1 row)

